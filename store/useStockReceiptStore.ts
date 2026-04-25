import { create } from 'zustand';
import {
  collection,
  addDoc,
  query,
  onSnapshot,
  doc,
  Timestamp,
  runTransaction,
  orderBy,
} from 'firebase/firestore';
import { fireDB } from '@/firebase/config';
import { StockReceipt } from '@/lib/types';

interface StockReceiptState {
  receipts: StockReceipt[];
  loading: boolean;
  /** Live unsubscribe handle — guarded against re-subscribe leaks. */
  _unsubReceipts: (() => void) | null;
  addReceipt: (receipt: Omit<StockReceipt, 'id'>) => Promise<void>;
  fetchReceipts: () => void;
  cleanup: () => void;
}

export const useStockReceiptStore = create<StockReceiptState>((set, get) => ({
  receipts: [],
  loading: true,
  _unsubReceipts: null,

  /**
   * Atomic stock-receipt commit.
   *
   * Old code did `addDoc(receipt)` then per-item `getDoc + updateDoc` outside
   * any transaction. Two concurrent receipts on the same product would
   * corrupt the weighted-average cost: each read the same `currentCost`,
   * each computed a new average against the OLD stock, and whichever wrote
   * last won — discarding the other's adjustment.
   *
   * New: ALL reads (every product doc) happen first inside a Firestore
   * transaction, all derived values are computed, then ALL writes
   * (receipt doc + per-product stock+costPrice) commit together. Movement
   * log writes happen post-commit (best-effort; the transaction guarantees
   * stock + cost are correct, log entries are pure audit trail).
   */
  addReceipt: async (receipt) => {
    const ts = new Date();
    const receiptRef = doc(collection(fireDB, 'stockReceipts')); // pre-allocated id
    const movementsToLog: Array<{
      productId: string;
      productTitle: string;
      quantity: number;
      stockBefore: number;
      stockAfter: number;
      reason: string;
    }> = [];

    await runTransaction(fireDB, async (tx) => {
      const productRefs = receipt.items
        .filter((i) => i.productId)
        .map((i) => doc(fireDB, 'products', i.productId));

      // ── ALL READS first ──
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

      // ── Pre-compute writes ──
      const productUpdates: Array<{ ref: ReturnType<typeof doc>; stock: number; costPrice: number }> = [];
      const validItems = receipt.items.filter((i) => i.productId);

      for (let i = 0; i < productSnaps.length; i++) {
        const snap = productSnaps[i];
        const item = validItems[i];
        if (!snap.exists()) continue;
        const data = snap.data();
        const currentStock = (data.stock as number) ?? 0;
        const currentCost = (data.costPrice as number) ?? 0;
        const newStock = currentStock + item.quantity;
        // Weighted-avg cost: if we had stock at currentCost and now buy
        // more at item.unitCost, the blended cost is (qty*cost) / qty_total.
        const totalOldValue = currentStock * currentCost;
        const totalNewValue = item.quantity * item.unitCost;
        const weightedAvgCost = newStock > 0
          ? Math.round((totalOldValue + totalNewValue) / newStock)
          : item.unitCost;
        productUpdates.push({
          ref: productRefs[i],
          stock: newStock,
          costPrice: weightedAvgCost,
        });
        movementsToLog.push({
          productId: item.productId,
          productTitle: item.productTitle,
          quantity: item.quantity,
          stockBefore: currentStock,
          stockAfter: newStock,
          reason: `Kirim: ${receipt.supplierName}`,
        });
      }

      // ── ALL WRITES ──
      tx.set(receiptRef, {
        ...receipt,
        date: ts,
      });
      for (const u of productUpdates) {
        tx.update(u.ref, { stock: u.stock, costPrice: u.costPrice });
      }
    });

    // Audit log post-commit (best-effort).
    for (const m of movementsToLog) {
      addDoc(collection(fireDB, 'stockMovements'), {
        productId: m.productId,
        productTitle: m.productTitle,
        type: 'kirim',
        quantity: m.quantity,
        stockBefore: m.stockBefore,
        stockAfter: m.stockAfter,
        reason: m.reason,
        reference: receiptRef.id,
        timestamp: Timestamp.now(),
      }).catch((err) => console.error('Error logging stock movement:', err));
    }
  },

  fetchReceipts: () => {
    if (get()._unsubReceipts) return; // dedup — prevents listener leak on remount
    set({ loading: true });
    try {
      const q = query(collection(fireDB, 'stockReceipts'), orderBy('date', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const receipts: StockReceipt[] = [];
        snapshot.forEach((d) => {
          receipts.push({ ...d.data(), id: d.id } as StockReceipt);
        });
        set({ receipts, loading: false });
      });
      set({ _unsubReceipts: unsub });
    } catch (error) {
      console.error('Error fetching receipts:', error);
      set({ loading: false });
    }
  },

  cleanup: () => {
    const unsub = get()._unsubReceipts;
    if (unsub) {
      unsub();
      set({ _unsubReceipts: null });
    }
  },
}));
