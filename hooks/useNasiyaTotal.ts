"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { fireDB } from "@/firebase/config";
import { isAdminEmail } from "@/lib/admin-config";
import { useAuthStore } from "@/store/authStore";

/**
 * Real outstanding nasiya (customer credit) balance — the authoritative
 * AR figure for the dashboard.
 *
 * Why a separate hook (instead of summarizing orders)?
 *   The previous dashboard used `orderNasiyaAmount(order)` which reads the
 *   `paymentBreakdown` snapshot taken at sale time. That value never
 *   decreases as customers pay, so the "Qarzdorlik" card kept climbing
 *   forever even after every debt was settled. The truth lives in the
 *   `nasiya` collection's `remaining` field, maintained server-side as
 *   payments are recorded.
 *
 * Auth: Firestore rules restrict /nasiya reads to admin or to entries
 * whose customerUid matches the requester. Non-admins get no values; the
 * hook returns 0 silently in that case.
 *
 * Returns:
 *   - total:   live UZS sum of `remaining` across non-paid entries
 *   - count:   number of open/partial nasiya entries
 *   - loading: true until the first snapshot arrives
 */
export interface NasiyaTotalsState {
  total: number;
  count: number;
  loading: boolean;
}

export function useNasiyaTotal(): NasiyaTotalsState {
  const userData = useAuthStore((s) => s.userData);
  const isAdmin = isAdminEmail(userData?.email);
  const [state, setState] = useState<NasiyaTotalsState>({
    total: 0,
    count: 0,
    loading: true,
  });

  useEffect(() => {
    // Non-admins can't query the whole nasiya collection (rules deny);
    // skip subscribing to avoid noisy "permission denied" errors.
    if (!isAdmin) {
      setState({ total: 0, count: 0, loading: false });
      return;
    }

    const ref = collection(fireDB, "nasiya");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        let total = 0;
        let count = 0;
        snap.forEach((doc) => {
          const d = doc.data() as {
            remaining?: number;
            amount?: number;
            paid?: number;
            status?: string;
          };
          if (d.status === "paid") return;
          // Prefer the server-maintained `remaining`; fall back to
          // amount-paid if the field is missing on legacy entries.
          const remaining =
            typeof d.remaining === "number"
              ? d.remaining
              : Math.max(0, (d.amount || 0) - (d.paid || 0));
          if (remaining > 0) {
            total += remaining;
            count++;
          }
        });
        setState({ total, count, loading: false });
      },
      (err) => {
        // Firestore can return 'permission-denied' if rules tighten while
        // the listener is live. Fail soft — show zero rather than crash.
        console.warn("[useNasiyaTotal] subscription failed:", err.message);
        setState({ total: 0, count: 0, loading: false });
      },
    );

    return () => unsub();
  }, [isAdmin]);

  return state;
}
