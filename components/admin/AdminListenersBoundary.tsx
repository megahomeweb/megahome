"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Tears down admin Firestore live listeners when the user navigates out
 * of the admin section.
 *
 * Why this exists:
 *   The store-level listeners (orders, products, categories,
 *   notifications) all dedupe themselves so that two admin pages
 *   subscribed at the same time share one Firestore subscription.
 *   That's the right design for navigation between /admin/orders and
 *   /admin/products. But once the user leaves /admin entirely (back to
 *   the storefront, or to logout), nothing cleans those listeners up —
 *   they keep firing snapshot reads against Firestore for the lifetime
 *   of the tab. On mobile the cost is real: bandwidth, battery, and
 *   eventually denied reads after auth changes.
 *
 *   This component sits inside the admin layout, mounts when the user
 *   first hits any /admin/* route, and runs its cleanup callback only
 *   when the layout itself unmounts (i.e., the user has navigated out
 *   of the entire /admin tree). Cleanup is idempotent — calling it on
 *   a no-op listener is safe.
 *
 * What it does NOT do:
 *   - It does not stop listeners between admin pages. That would cause
 *     a flash of empty data on every navigation.
 *   - It does not cleanup on logout. authStore.logout() handles that
 *     explicitly, before signOut, to avoid post-signout permission
 *     errors. This boundary is a safety net for the navigated-away
 *     case where logout never fires.
 */
export default function AdminListenersBoundary() {
  // Subscribing to pathname keeps this effect tied to the layout
  // lifecycle. Returning a cleanup that runs on unmount fires only
  // when the entire layout subtree is unmounted, not on internal
  // route changes.
  const pathname = usePathname();
  void pathname; // referenced to lock the dependency on admin tree

  useEffect(() => {
    return () => {
      // Run all cleanups inside try/catch so a single bad import
      // (e.g. circular dependency surface area) can't poison the
      // unmount path.
      const stopAll = async () => {
        try {
          const { useOrderStore } = await import("@/store/useOrderStore");
          useOrderStore.getState().cleanup();
        } catch (e) {
          console.warn("AdminListenersBoundary: order cleanup failed", e);
        }
        try {
          const useProductStore = (await import("@/store/useProductStore"))
            .default as { getState: () => { cleanup?: () => void } };
          useProductStore.getState().cleanup?.();
        } catch (e) {
          console.warn("AdminListenersBoundary: product cleanup failed", e);
        }
        try {
          const useCategoryStore = (await import("@/store/useCategoryStore"))
            .default as { getState: () => { cleanup?: () => void } };
          useCategoryStore.getState().cleanup?.();
        } catch (e) {
          console.warn("AdminListenersBoundary: category cleanup failed", e);
        }
        try {
          const { useNotificationStore } = await import(
            "@/store/useNotificationStore"
          );
          (
            useNotificationStore.getState() as { stopListening?: () => void }
          ).stopListening?.();
        } catch (e) {
          console.warn(
            "AdminListenersBoundary: notification cleanup failed",
            e,
          );
        }
      };
      void stopAll();
    };
  }, []);

  return null;
}
