import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { fireDB } from '@/firebase/config';
import { Order, ProductT } from '@/lib/types';
import { formatUZS } from '@/lib/formatPrice';
import { getStatusInfo } from '@/lib/orderStatus';

export interface OrderPayload {
  clientName: string;
  clientPhone: string;
  totalPrice: number;
  totalQuantity: number;
  status: string;
  basketItems: Array<{ title: string; price: string; quantity: number; category: string; productImageUrl?: Array<{ url: string }> }>;
}

export interface UserPayload {
  name: string;
  email: string;
  phone: string;
  role: string;
}

export interface SummaryPayload {
  totalOrders: number;
  newOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  revenue: number;
  profit: number;
  lowStockCount: number;
  newUsers: number;
  date: string;
}

export interface Notification {
  id: string;
  refId: string;
  type: 'new_order' | 'new_user' | 'order_status_change' | 'daily_summary';
  title: string;
  message: string;
  detail: string;
  timestamp: number;
  read: boolean;
  orderData?: OrderPayload;
  userData?: UserPayload;
  summaryData?: SummaryPayload;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  _seenOrderIds: string[];
  _seenUserIds: string[];
  _orderStatusMap: Record<string, string>;
  _ordersInitialized: boolean;
  _usersInitialized: boolean;
  _unsubOrders: (() => void) | null;
  _unsubUsers: (() => void) | null;
  newUserIds: string[];
  _lastSummaryDate: string;
  startListening: () => void;
  stopListening: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  isNewUser: (uid: string) => boolean;
  addDailySummary: (data: SummaryPayload) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      _seenOrderIds: [],
      _seenUserIds: [],
      _orderStatusMap: {},
      _ordersInitialized: false,
      _usersInitialized: false,
      _unsubOrders: null,
      _unsubUsers: null,
      newUserIds: [],
      _lastSummaryDate: '',

      addDailySummary: (data: SummaryPayload) => {
        const state = get();
        if (state._lastSummaryDate === data.date) return;

        const notif: Notification = {
          id: `summary_${data.date}`,
          refId: data.date,
          type: 'daily_summary',
          title: `Kunlik hisobot — ${data.date.split('-').reverse().join('.')}`,
          message: `${data.totalOrders} ta buyurtma | Daromad: ${formatUZS(data.revenue)}`,
          detail: `Foyda: ${formatUZS(data.profit)} | ${data.lowStockCount} ta kam qolgan`,
          timestamp: Date.now(),
          read: false,
          summaryData: data,
        };

        set((prev) => ({
          notifications: [notif, ...prev.notifications].slice(0, 50),
          unreadCount: prev.unreadCount + 1,
          _lastSummaryDate: data.date,
        }));
      },

      startListening: () => {
        const state = get();

        // --- Orders listener ---
        if (!state._unsubOrders) {
          const ordersUnsub = onSnapshot(query(collection(fireDB, 'orders')), (snapshot) => {
            const s = get();

            if (!s._ordersInitialized) {
              // On first load, merge persisted seen IDs with current snapshot
              const statusMap: Record<string, string> = { ...s._orderStatusMap };
              snapshot.docs.forEach((d) => {
                const data = d.data();
                statusMap[d.id] = data.status || 'yangi';
              });
              const snapshotIds = snapshot.docs.map((d) => d.id);
              const merged = [...new Set([...snapshotIds, ...s._seenOrderIds])];
              set({
                _ordersInitialized: true,
                _seenOrderIds: merged,
                _orderStatusMap: statusMap,
              });
              return;
            }

            const newNotifs: Notification[] = [];
            const statusUpdates: Record<string, string> = {};

            for (const change of snapshot.docChanges()) {
              const id = change.doc.id;
              const data = change.doc.data() as Order;

              if (change.type === 'added') {
                if (s._seenOrderIds.includes(id)) continue;
                statusUpdates[id] = data.status || 'yangi';
                newNotifs.push({
                  id: `order_${id}`,
                  refId: id,
                  type: 'new_order',
                  title: `Yangi buyurtma: ${data.clientName}`,
                  message: `${data.totalQuantity} ta mahsulot — ${formatUZS(data.totalPrice)}`,
                  detail: data.clientPhone,
                  timestamp: Date.now(),
                  read: false,
                  orderData: {
                    clientName: data.clientName,
                    clientPhone: data.clientPhone,
                    totalPrice: data.totalPrice,
                    totalQuantity: data.totalQuantity,
                    status: data.status || 'yangi',
                    basketItems: (data.basketItems || []).map((item: ProductT) => ({
                      title: item.title,
                      price: item.price,
                      quantity: item.quantity,
                      category: item.category,
                      productImageUrl: item.productImageUrl?.slice(0, 1),
                    })),
                  },
                });
              } else if (change.type === 'modified') {
                // Detect status change
                const newStatus = data.status || 'yangi';
                const prevStatus = s._orderStatusMap[id];
                if (prevStatus && prevStatus !== newStatus) {
                  const statusInfo = getStatusInfo(newStatus);
                  statusUpdates[id] = newStatus;
                  newNotifs.push({
                    id: `status_${id}_${Date.now()}`,
                    refId: id,
                    type: 'order_status_change',
                    title: `${data.clientName}: ${statusInfo.label}`,
                    message: `${data.totalQuantity} ta mahsulot — ${formatUZS(data.totalPrice)}`,
                    detail: data.clientPhone,
                    timestamp: Date.now(),
                    read: false,
                    orderData: {
                      clientName: data.clientName,
                      clientPhone: data.clientPhone,
                      totalPrice: data.totalPrice,
                      totalQuantity: data.totalQuantity,
                      status: newStatus,
                      basketItems: (data.basketItems || []).map((item: ProductT) => ({
                        title: item.title,
                        price: item.price,
                        quantity: item.quantity,
                        category: item.category,
                        productImageUrl: item.productImageUrl?.slice(0, 1),
                      })),
                    },
                  });
                }
              }
            }

            if (newNotifs.length > 0 || Object.keys(statusUpdates).length > 0) {
              set((prev) => {
                // Deduplicate: skip notifications that already exist
                const existingIds = new Set(prev.notifications.map((n) => n.id));
                const uniqueNotifs = newNotifs.filter((n) => !existingIds.has(n.id));
                return {
                  notifications: uniqueNotifs.length > 0
                    ? [...uniqueNotifs, ...prev.notifications].slice(0, 50)
                    : prev.notifications,
                  unreadCount: prev.unreadCount + uniqueNotifs.length,
                  _seenOrderIds: [...Object.keys(statusUpdates).filter((k) => !prev._seenOrderIds.includes(k)), ...prev._seenOrderIds],
                  _orderStatusMap: { ...prev._orderStatusMap, ...statusUpdates },
                };
              });
            }
          });
          set({ _unsubOrders: ordersUnsub });
        }

        // --- Users listener ---
        if (!state._unsubUsers) {
          const usersUnsub = onSnapshot(query(collection(fireDB, 'user')), (snapshot) => {
            const s = get();

            if (!s._usersInitialized) {
              // Merge persisted seen IDs with current snapshot to avoid re-notifying
              const snapshotIds = snapshot.docs.map((d) => d.id);
              const merged = [...new Set([...snapshotIds, ...s._seenUserIds])];
              set({
                _usersInitialized: true,
                _seenUserIds: merged,
              });
              return;
            }

            const newNotifs: Notification[] = [];
            const newUids: string[] = [];
            for (const change of snapshot.docChanges()) {
              if (change.type === 'added') {
                const uid = change.doc.id;
                if (s._seenUserIds.includes(uid)) continue;
                const data = change.doc.data();
                newUids.push(uid);
                newNotifs.push({
                  id: `user_${uid}`,
                  refId: uid,
                  type: 'new_user',
                  title: data.role === 'prospect'
                    ? `Yangi ehtimoliy foydalanuvchi: ${data.name}`
                    : `Yangi foydalanuvchi: ${data.name}`,
                  message: data.phone || data.email || '',
                  detail: data.email || '',
                  timestamp: Date.now(),
                  read: false,
                  userData: {
                    name: data.name || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    role: data.role || 'user',
                  },
                });
              }
            }

            if (newNotifs.length > 0) {
              set((prev) => {
                // Deduplicate: skip notifications that already exist
                const existingIds = new Set(prev.notifications.map((n) => n.id));
                const uniqueNotifs = newNotifs.filter((n) => !existingIds.has(n.id));
                const uniqueUids = newUids.filter((uid) => !prev._seenUserIds.includes(uid));
                if (uniqueNotifs.length === 0) return prev;
                return {
                  notifications: [...uniqueNotifs, ...prev.notifications].slice(0, 50),
                  unreadCount: prev.unreadCount + uniqueNotifs.length,
                  _seenUserIds: [...uniqueUids, ...prev._seenUserIds],
                  newUserIds: [...uniqueUids, ...prev.newUserIds],
                };
              });
            }
          });
          set({ _unsubUsers: usersUnsub });
        }
      },

      stopListening: () => {
        const s = get();
        if (s._unsubOrders) { s._unsubOrders(); }
        if (s._unsubUsers) { s._unsubUsers(); }
        set({
          _unsubOrders: null,
          _unsubUsers: null,
          _ordersInitialized: false,
          _usersInitialized: false,
        });
      },

      markAsRead: (id) => {
        set((state) => {
          const target = state.notifications.find((n) => n.id === id);
          if (!target || target.read) return state;
          // If marking a user notification as read, remove from newUserIds
          const updatedNewUserIds = target.type === 'new_user'
            ? state.newUserIds.filter((uid) => uid !== target.refId)
            : state.newUserIds;
          return {
            notifications: state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - 1),
            newUserIds: updatedNewUserIds,
          };
        });
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
          newUserIds: [],
        }));
      },

      removeNotification: (id) => {
        set((state) => {
          const target = state.notifications.find((n) => n.id === id);
          const updatedNewUserIds = target?.type === 'new_user'
            ? state.newUserIds.filter((uid) => uid !== target.refId)
            : state.newUserIds;
          return {
            notifications: state.notifications.filter((n) => n.id !== id),
            unreadCount: target && !target.read ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
            newUserIds: updatedNewUserIds,
          };
        });
      },

      clearAll: () => {
        set({ notifications: [], unreadCount: 0, newUserIds: [] });
      },

      isNewUser: (uid: string) => {
        const state = get();
        if (!state.newUserIds.includes(uid)) return false;
        // Auto-expire after 30 minutes — badge disappears but notification stays in bell
        const notif = state.notifications.find((n) => n.refId === uid && n.type === 'new_user');
        if (!notif) return false;
        const thirtyMinutes = 30 * 60 * 1000;
        return Date.now() - notif.timestamp < thirtyMinutes;
      },
    }),
    {
      name: 'admin-notifications',
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount,
        _seenOrderIds: state._seenOrderIds,
        _seenUserIds: state._seenUserIds,
        _orderStatusMap: state._orderStatusMap,
        newUserIds: state.newUserIds,
        _lastSummaryDate: state._lastSummaryDate,
      }),
    }
  )
);
