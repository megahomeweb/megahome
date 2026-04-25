import { create } from "zustand";
import { collection, query, onSnapshot, doc, updateDoc, getDoc, increment, writeBatch, Timestamp, where, addDoc } from "firebase/firestore";
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
    try {
      const orderRef = doc(fireDB, "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) return;

      const orderData = orderSnap.data();
      const prevStatus = (orderData.status ?? 'yangi') as OrderStatus;
      const basketItems = (orderData.basketItems ?? []) as ProductT[];
      const stockReserved = orderData.stockReserved === true;

      // Decrement on DELIVERY only for LEGACY orders (no stockReserved flag).
      // New orders were already decremented at creation time.
      if (status === 'yetkazildi' && prevStatus !== 'yetkazildi' && !stockReserved) {
        await decrementStock(basketItems, orderId, 'Buyurtma yetkazildi');
      }

      // Restore stock on CANCELLATION — semantics depend on model:
      //   - Reserved orders: restore whenever transitioning INTO cancelled
      //     from a non-cancelled state (stock was already decremented at create).
      //   - Legacy orders: restore only if cancelling from delivered
      //     (stock was only decremented at delivery).
      if (status === 'bekor_qilindi' && prevStatus !== 'bekor_qilindi') {
        if (stockReserved) {
          await restoreStock(basketItems, orderId, 'Buyurtma bekor qilindi');
        } else if (prevStatus === 'yetkazildi') {
          await restoreStock(basketItems, orderId, 'Buyurtma bekor qilindi');
        }
      }

      await updateDoc(orderRef, { status });
    } catch (error) {
      console.error("Error updating order status:", error);
      throw error;
    }
  },

  bulkUpdateOrderStatus: async (orderIds: string[], status: OrderStatus) => {
    const batch = writeBatch(fireDB);
    const results = { success: 0, failed: 0 };

    const movementLogs: Array<{
      productId: string;
      productTitle: string;
      type: 'sotish' | 'qaytarish';
      quantity: number;
      stockBefore: number;
      reference: string;
    }> = [];

    for (const orderId of orderIds) {
      try {
        const orderRef = doc(fireDB, "orders", orderId);
        const orderSnap = await getDoc(orderRef);
        if (!orderSnap.exists()) { results.failed++; continue; }

        const orderData = orderSnap.data();
        const prevStatus = (orderData.status ?? 'yangi') as OrderStatus;
        const basketItems = (orderData.basketItems ?? []) as ProductT[];
        const stockReserved = orderData.stockReserved === true;

        if (status === 'yetkazildi' && prevStatus !== 'yetkazildi' && !stockReserved) {
          for (const item of basketItems) {
            if (!item.id) continue;
            const productSnap = await getDoc(doc(fireDB, "products", item.id));
            const stockBefore = productSnap.exists() ? (productSnap.data().stock ?? 0) : 0;
            batch.update(doc(fireDB, "products", item.id), { stock: increment(-item.quantity) });
            movementLogs.push({
              productId: item.id,
              productTitle: item.title || '',
              type: 'sotish',
              quantity: -item.quantity,
              stockBefore,
              reference: orderId,
            });
          }
        }

        if (status === 'bekor_qilindi' && prevStatus !== 'bekor_qilindi') {
          const shouldRestore = stockReserved || prevStatus === 'yetkazildi';
          if (shouldRestore) {
            for (const item of basketItems) {
              if (!item.id) continue;
              const productSnap = await getDoc(doc(fireDB, "products", item.id));
              const stockBefore = productSnap.exists() ? (productSnap.data().stock ?? 0) : 0;
              batch.update(doc(fireDB, "products", item.id), { stock: increment(item.quantity) });
              movementLogs.push({
                productId: item.id,
                productTitle: item.title || '',
                type: 'qaytarish',
                quantity: item.quantity,
                stockBefore,
                reference: orderId,
              });
            }
          }
        }

        batch.update(orderRef, { status });
        results.success++;
      } catch {
        results.failed++;
      }
    }

    await batch.commit();

    for (const log of movementLogs) {
      addDoc(collection(fireDB, "stockMovements"), {
        productId: log.productId,
        productTitle: log.productTitle,
        type: log.type,
        quantity: log.quantity,
        stockBefore: log.stockBefore,
        stockAfter: log.stockBefore + log.quantity,
        reason: log.type === 'sotish' ? 'Buyurtma yetkazildi (ommaviy)' : 'Buyurtma bekor qilindi (ommaviy)',
        reference: log.reference,
        timestamp: Timestamp.now(),
      }).catch((err) => console.error('Error logging stock movement:', err));
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
    get().cleanup();
    set({ loadingOrders: true });
    try {
      const q = query(collection(fireDB, "orders"), where("userUid", "==", userUid));
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

// ── helpers ───────────────────────────────────────────────

async function decrementStock(basketItems: ProductT[], orderId: string, reason: string) {
  const stockSnapshots = new Map<string, number>();
  for (const item of basketItems) {
    if (!item.id) continue;
    const productSnap = await getDoc(doc(fireDB, "products", item.id));
    stockSnapshots.set(item.id, productSnap.exists() ? (productSnap.data().stock ?? 0) : 0);
  }

  const stockBatch = writeBatch(fireDB);
  for (const item of basketItems) {
    if (!item.id) continue;
    stockBatch.update(doc(fireDB, "products", item.id), { stock: increment(-item.quantity) });
  }
  await stockBatch.commit();

  for (const item of basketItems) {
    if (!item.id) continue;
    const stockBefore = stockSnapshots.get(item.id) ?? 0;
    addDoc(collection(fireDB, "stockMovements"), {
      productId: item.id,
      productTitle: item.title,
      type: 'sotish',
      quantity: -item.quantity,
      stockBefore,
      stockAfter: stockBefore - item.quantity,
      reason,
      reference: orderId,
      timestamp: Timestamp.now(),
    }).catch((err) => console.error('Error logging stock movement:', err));
  }
}

async function restoreStock(basketItems: ProductT[], orderId: string, reason: string) {
  const stockSnapshots = new Map<string, number>();
  for (const item of basketItems) {
    if (!item.id) continue;
    const productSnap = await getDoc(doc(fireDB, "products", item.id));
    stockSnapshots.set(item.id, productSnap.exists() ? (productSnap.data().stock ?? 0) : 0);
  }

  const stockBatch = writeBatch(fireDB);
  for (const item of basketItems) {
    if (!item.id) continue;
    stockBatch.update(doc(fireDB, "products", item.id), { stock: increment(item.quantity) });
  }
  await stockBatch.commit();

  for (const item of basketItems) {
    if (!item.id) continue;
    const stockBefore = stockSnapshots.get(item.id) ?? 0;
    addDoc(collection(fireDB, "stockMovements"), {
      productId: item.id,
      productTitle: item.title,
      type: 'qaytarish',
      quantity: item.quantity,
      stockBefore,
      stockAfter: stockBefore + item.quantity,
      reason,
      reference: orderId,
      timestamp: Timestamp.now(),
    }).catch((err) => console.error('Error logging stock movement:', err));
  }
}
