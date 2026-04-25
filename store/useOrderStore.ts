import { create } from "zustand";
import { collection, query, onSnapshot, doc, increment, Timestamp, where, addDoc, runTransaction, orderBy } from "firebase/firestore";
import { fireDB, auth } from '@/firebase/config';
import { Order, OrderStatus, ProductT } from "@/lib/types";

/**
 * Stock model:
 *   - New orders created through `/api/orders/create` get `stockReserved: true`
 *     and stock is decremented at creation time (inside a Firestore
 *     transaction on the server). Delivery (`yetkazildi`) does NOT decrement
 *     again. Cancellation (`bekor_qilindi`) restores the stock from ANY prior
 *     non-cancelled state.
 *   - Legacy orders (created before this change, flag missing/false) keep the
 *     old "decrement on delivery" behaviour so we don't double-decrement
 *     existing data.
 */

export interface CreateOrderInput {
  items: { productId: string; quantity: number }[];
  clientName: string;
  clientPhone: string;
  deliveryAddress?: string;
  orderNote?: string;
  paymentMethod?: string;
  totalPriceHint?: number;
  targetUserUid?: string;
  // POS additions
  paymentBreakdown?: Array<{
    method: 'naqd' | 'nasiya' | 'karta';
    amount: number;
    dueDate?: string; // ISO
    note?: string;
  }>;
  ticketDiscount?: { type: 'pct' | 'abs'; value: number };
  source?: 'pos' | 'web' | 'admin' | 'telegram';
  /** Customer-entered promo code; server validates + applies atomically. */
  promoCode?: string;
}

export interface CreateOrderResult {
  ok: true;
  orderId: string;
  totalPrice: number;
  totalQuantity: number;
  basketItems: ProductT[];
  priceChanged: boolean;
  nasiyaIds?: string[];
}

export interface CreateOrderError {
  ok: false;
  status: number;
  message: string;
  stockErrors?: Array<{ productId: string; title?: string; available: number; requested: number }>;
}

interface StoreState {
  orders: Order[];
  currentOrder: Order | null;
  loadingOrders: boolean;
  _unsubOrders: (() => void) | null;
  createOrder: (input: CreateOrderInput) => Promise<CreateOrderResult | CreateOrderError>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  bulkUpdateOrderStatus: (orderIds: string[], status: OrderStatus) => Promise<{ success: number; failed: number }>;
  fetchAllOrders: () => void;
  fetchUserOrders: (userUid: string) => void;
  cleanup: () => void;
}

export const useOrderStore = create<StoreState>((set, get) => ({
  orders: [],
  currentOrder: null,
  loadingOrders: true,
  _unsubOrders: null,

  createOrder: async (input: CreateOrderInput): Promise<CreateOrderResult | CreateOrderError> => {
    try {
      const user = auth.currentUser;
      if (!user) {
        return { ok: false, status: 401, message: 'Avval tizimga kiring' };
      }
      const idToken = await user.getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      };
      if (input.totalPriceHint && Number.isFinite(input.totalPriceHint)) {
        headers['X-Client-Total-Hint'] = String(input.totalPriceHint);
      }
      // Per-call idempotency key — prevents double-create if a flaky
      // network retries the POST. Server uses Admin SDK create() to
      // atomically claim the key; second attempt returns { dedup: true }.
      headers['Idempotency-Key'] =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: input.items,
          clientName: input.clientName,
          clientPhone: input.clientPhone,
          deliveryAddress: input.deliveryAddress,
          orderNote: input.orderNote,
          paymentMethod: input.paymentMethod,
          targetUserUid: input.targetUserUid,
          paymentBreakdown: input.paymentBreakdown,
          ticketDiscount: input.ticketDiscount,
          source: input.source,
          promoCode: input.promoCode,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          message: body?.error || 'Buyurtma yaratilmadi',
          stockErrors: body?.stockErrors,
        };
      }
      return {
        ok: true,
        orderId: body.orderId,
        totalPrice: body.totalPrice,
        totalQuantity: body.totalQuantity,
        basketItems: body.basketItems,
        priceChanged: !!body.priceChanged,
        nasiyaIds: Array.isArray(body.nasiyaIds) ? body.nasiyaIds : undefined,
      };
    } catch (err) {
      console.error('createOrder error:', err);
      return { ok: false, status: 0, message: 'Tarmoq xatoligi' };
    }
  },

  updateOrderStatus: async (orderId: string, status: OrderStatus) => {
    // Atomic via Firestore transaction. Previous read-then-write left a
    // race window: two admins clicking "yetkazildi" simultaneously both
    // saw prevStatus="tasdiqlangan", both decremented stock, both updated
    // status — stock decremented twice. Same for cancellation restore.
    // The transaction makes the prevStatus check + stock change + status
    // write all-or-nothing per concurrent attempt.
    try {
      const orderRef = doc(fireDB, "orders", orderId);
      const movementsToLog: Array<{
        productId: string;
        productTitle: string;
        type: 'sotish' | 'qaytarish';
        quantity: number;
        stockBefore: number;
        stockAfter: number;
        reason: string;
      }> = [];

      await runTransaction(fireDB, async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) return;

        const orderData = orderSnap.data();
        const prevStatus = (orderData.status ?? 'yangi') as OrderStatus;
        const basketItems = (orderData.basketItems ?? []) as ProductT[];
        const stockReserved = orderData.stockReserved === true;

        // Idempotent: target status already set → no-op (covers concurrent
        // double-clicks where the second tx re-reads after the first commits).
        if (prevStatus === status) return;

        const goingDelivered = status === 'yetkazildi' && prevStatus !== 'yetkazildi' && !stockReserved;
        const goingCancelled = status === 'bekor_qilindi' && prevStatus !== 'bekor_qilindi'
          && (stockReserved || prevStatus === 'yetkazildi');

        // ── ALL READS first (Firestore tx requirement) ──
        const productRefs = (goingDelivered || goingCancelled)
          ? basketItems.filter((i) => i.id).map((i) => doc(fireDB, 'products', i.id))
          : [];
        const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

        // ── ALL WRITES ──
        if (goingDelivered) {
          for (let i = 0; i < productSnaps.length; i++) {
            const snap = productSnaps[i];
            const item = basketItems[i];
            const before = snap.exists() ? (snap.data().stock ?? 0) : 0;
            tx.update(productRefs[i], { stock: increment(-item.quantity) });
            movementsToLog.push({
              productId: item.id,
              productTitle: item.title || '',
              type: 'sotish',
              quantity: -item.quantity,
              stockBefore: before,
              stockAfter: before - item.quantity,
              reason: 'Buyurtma yetkazildi',
            });
          }
        } else if (goingCancelled) {
          for (let i = 0; i < productSnaps.length; i++) {
            const snap = productSnaps[i];
            const item = basketItems[i];
            const before = snap.exists() ? (snap.data().stock ?? 0) : 0;
            tx.update(productRefs[i], { stock: increment(item.quantity) });
            movementsToLog.push({
              productId: item.id,
              productTitle: item.title || '',
              type: 'qaytarish',
              quantity: item.quantity,
              stockBefore: before,
              stockAfter: before + item.quantity,
              reason: 'Buyurtma bekor qilindi',
            });
          }
        }

        tx.update(orderRef, { status });
      });

      // Audit log post-commit (best-effort; idempotency at the order layer
      // ensures we never double-decrement, so duplicate movement logs are
      // harmless if they ever occurred — but the tx prevents that anyway).
      for (const m of movementsToLog) {
        addDoc(collection(fireDB, 'stockMovements'), {
          ...m,
          reference: orderId,
          timestamp: Timestamp.now(),
        }).catch((err) => console.error('Error logging stock movement:', err));
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      throw error;
    }
  },

  bulkUpdateOrderStatus: async (orderIds: string[], status: OrderStatus) => {
    // Each order goes through its own atomic updateOrderStatus call so the
    // race-condition fix above also applies in bulk. Sacrifices some
    // throughput vs the old single-batch approach but eliminates the
    // double-decrement risk under concurrent admin clicks. A failed order
    // doesn't block the rest.
    const results = { success: 0, failed: 0 };
    const updateFn = get().updateOrderStatus;
    for (const orderId of orderIds) {
      try {
        await updateFn(orderId, status);
        results.success++;
      } catch (err) {
        console.error(`bulkUpdateOrderStatus: order ${orderId} failed`, err);
        results.failed++;
      }
    }
    set((state) => ({
      orders: state.orders.map((o) =>
        orderIds.includes(o.id) ? { ...o, status } : o
      ),
    }));
    return results;
  },

  cleanup: () => {
    const unsub = get()._unsubOrders;
    if (unsub) {
      unsub();
      set({ _unsubOrders: null });
    }
  },

  fetchAllOrders: () => {
    if (get()._unsubOrders) return;
    set({ loadingOrders: true });
    try {
      const q = query(collection(fireDB, "orders"));
      const unsubscribe = onSnapshot(q, (QuerySnapshot) => {
        const OrderArray: Order[] = [];
        QuerySnapshot.forEach((d) => {
          OrderArray.push({ ...d.data(), id: d.id } as Order);
        });
        set({ orders: OrderArray, loadingOrders: false });
      });
      set({ _unsubOrders: unsubscribe });
    } catch (error) {
      console.error("Error fetching orders: ", error);
      set({ loadingOrders: false });
    }
  },

  fetchUserOrders: (userUid: string) => {
    // Cleanup ensures we don't leak the previous listener when switching users
    // or navigating between admin (all orders) and customer (own orders) views.
    get().cleanup();
    set({ loadingOrders: true });
    try {
      // Server-side ordering by date desc — the customer history page
      // previously rendered orders in arbitrary Firestore-default order.
      const q = query(
        collection(fireDB, "orders"),
        where("userUid", "==", userUid),
        orderBy("date", "desc"),
      );
      const unsubscribe = onSnapshot(q, (QuerySnapshot) => {
        const OrderArray: Order[] = [];
        QuerySnapshot.forEach((d) => {
          OrderArray.push({ ...d.data(), id: d.id } as Order);
        });
        set({ orders: OrderArray, loadingOrders: false });
      });
      set({ _unsubOrders: unsubscribe });
    } catch (error) {
      console.error("Error fetching user orders: ", error);
      set({ loadingOrders: false });
    }
  },
}));

// (decrementStock / restoreStock helpers removed — atomic logic now lives
// inside `updateOrderStatus` via runTransaction. Bulk path calls
// updateOrderStatus per order so the same atomicity applies.)
