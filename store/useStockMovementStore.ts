import { create } from "zustand";
import { collection, addDoc, onSnapshot, orderBy, query, limit, Timestamp } from "firebase/firestore";
import { fireDB } from "@/firebase/config";
import type { StockMovement, StockMovementType } from "@/lib/types";

interface StockMovementStore {
  movements: StockMovement[];
  loading: boolean;
  /** Live unsubscribe handle — stored so we don't leak listeners on remount. */
  _unsubMovements: (() => void) | null;
  fetchMovements: () => void;
  cleanup: () => void;
  logMovement: (data: {
    productId: string;
    productTitle: string;
    type: StockMovementType;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    reason: string;
    reference?: string;
  }) => Promise<void>;
}

const useStockMovementStore = create<StockMovementStore>((set, get) => ({
  movements: [],
  loading: true,
  _unsubMovements: null,

  fetchMovements: () => {
    // Dedup — every navigation to /admin/ombor used to attach a fresh
    // onSnapshot, leaking a listener per visit. Now first call wins;
    // subsequent calls are no-ops.
    if (get()._unsubMovements) return;
    const q = query(
      collection(fireDB, "stockMovements"),
      orderBy("timestamp", "desc"),
      limit(200),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as StockMovement[];
      set({ movements: data, loading: false });
    });
    set({ _unsubMovements: unsub });
  },

  cleanup: () => {
    const unsub = get()._unsubMovements;
    if (unsub) {
      unsub();
      set({ _unsubMovements: null });
    }
  },

  logMovement: async (data) => {
    await addDoc(collection(fireDB, "stockMovements"), {
      ...data,
      timestamp: Timestamp.now(),
    });
  },
}));

export default useStockMovementStore;
