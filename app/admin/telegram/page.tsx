"use client"
import React, { useEffect, useState, useMemo } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import { Button } from '@/components/ui/button';
import { collection, onSnapshot, query, doc, deleteDoc } from 'firebase/firestore';
import { fireDB, auth } from '@/firebase/config';
import { formatDateTimeShort } from '@/lib/formatDate';
import { useOrderStore } from '@/store/useOrderStore';
import useProductStore from '@/store/useProductStore';
import { useAuthStore } from '@/store/authStore';
import { isCompletedSale, orderRevenue, orderCost } from '@/lib/orderMath';
import toast from 'react-hot-toast';
import {
  Send, Bot, Users, Bell, BellOff, Trash2, RefreshCw,
  CheckCircle, XCircle, MessageSquare, Wifi, WifiOff,
  Search, ExternalLink, Settings, Zap
} from 'lucide-react';

interface TelegramUser {
  id: string;
  chatId: number;
  userUid?: string;
  phone?: string;
  userName?: string;
  isAdmin: boolean;
  linkedAt?: { seconds: number };
  lastActivity?: { seconds: number };
  settings: {
    orderNotifications: boolean;
    promotions: boolean;
  };
}

const TelegramPage = () => {
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<'unknown' | 'active' | 'inactive'>('unknown');

  // Live data sources for the test message — previously this used
  // hardcoded "5 orders, 15M revenue, etc." which made the test useless
  // (admin couldn't verify the formatting against real numbers, and
  // sending fake data to a live channel is misleading if anyone reads it).
  const { orders, fetchAllOrders } = useOrderStore();
  const { products, fetchProducts } = useProductStore();
  const { users, fetchAllUsers } = useAuthStore();
  useEffect(() => { fetchAllOrders(); }, [fetchAllOrders]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => {
    const unsub = fetchAllUsers() as (() => void) | undefined;
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [fetchAllUsers]);

  // Fetch telegram users
  useEffect(() => {
    const q = query(collection(fireDB, 'telegramUsers'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const users: TelegramUser[] = [];
      snap.forEach((d) => users.push({ id: d.id, ...d.data() } as TelegramUser));
      users.sort((a, b) => (b.lastActivity?.seconds || 0) - (a.lastActivity?.seconds || 0));
      setTelegramUsers(users);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Check webhook status
  useEffect(() => {
    fetch('/api/telegram/webhook')
      .then((res) => res.json())
      .then((data) => setWebhookStatus(data.active ? 'active' : 'inactive'))
      .catch(() => setWebhookStatus('inactive'));
  }, []);

  const filteredUsers = useMemo(() => {
    if (!search) return telegramUsers;
    const q = search.toLowerCase();
    return telegramUsers.filter(
      (u) =>
        u.userName?.toLowerCase().includes(q) ||
        u.phone?.includes(q) ||
        String(u.chatId).includes(q)
    );
  }, [telegramUsers, search]);

  const stats = useMemo(() => ({
    total: telegramUsers.length,
    admins: telegramUsers.filter((u) => u.isAdmin).length,
    withNotifs: telegramUsers.filter((u) => u.settings?.orderNotifications).length,
    linked: telegramUsers.filter((u) => u.userUid).length,
  }), [telegramUsers]);

  const handleTestMessage = async () => {
    setTestSending(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error('Avval tizimga kiring');
        return;
      }

      // Compute today's actual figures so the "test" message reflects
      // the same data the real daily summary would. Sending fabricated
      // numbers to admins trains them to mistrust real summaries.
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startMs = startOfDay.getTime();

      const todayOrders = orders.filter((o) => {
        const ts = o.date?.seconds ? o.date.seconds * 1000 : 0;
        return ts >= startMs;
      });

      let revenue = 0;
      let cost = 0;
      let delivered = 0;
      let cancelled = 0;
      let newOrders = 0;
      for (const o of todayOrders) {
        if (o.status === 'bekor_qilindi') { cancelled++; continue; }
        if (o.status === 'yetkazildi') delivered++;
        if (o.status === 'yangi' || !o.status) newOrders++;
        if (isCompletedSale(o)) {
          revenue += orderRevenue(o);
          cost += orderCost(o);
        }
      }
      const profit = revenue - cost;
      const lowStockCount = products.filter(
        (p) => typeof p.stock === 'number' && (p.stock as number) <= 5,
      ).length;
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const newUsers = users.filter((u) => {
        const t = (u as { time?: { seconds?: number } }).time;
        const ts = t?.seconds ? t.seconds * 1000 : 0;
        return ts >= oneDayAgo;
      }).length;

      const res = await fetch('/api/telegram/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'daily_summary',
          data: {
            totalOrders: todayOrders.length,
            newOrders,
            deliveredOrders: delivered,
            cancelledOrders: cancelled,
            revenue,
            profit,
            lowStockCount,
            newUsers,
            date: new Date().toISOString().split('T')[0],
          },
        }),
      });
      if (res.ok) toast.success('Test xabar yuborildi (haqiqiy bugungi raqamlar bilan)');
      else toast.error('Xabar yuborilmadi');
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setTestSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) { toast.error('Xabar matnini kiriting'); return; }
    if (!confirm(`${telegramUsers.length} ta foydalanuvchiga xabar yuboriladi. Davom etsinmi?`)) return;

    setSending(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error('Avval tizimga kiring');
        return;
      }
      const res = await fetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: broadcastText }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          data.skippedOptedOut
            ? `${data.sent} ta yuborildi · ${data.skippedOptedOut} ta bekor qilgan`
            : `${data.sent} ta foydalanuvchiga yuborildi`,
        );
        setBroadcastText('');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || 'Xabar yuborilmadi');
      }
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setSending(false);
    }
  };

  const handleUnlink = async (userId: string, userName: string) => {
    if (!confirm(`${userName} hisobini uzish?`)) return;
    try {
      await deleteDoc(doc(fireDB, 'telegramUsers', userId));
      toast.success('Hisob uzildi');
    } catch {
      toast.error('Xatolik');
    }
  };

  return (
    <div>
      <PanelTitle title="Telegram Bot" />

      {/* ── Status + Stats Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            {webhookStatus === 'active' ? (
              <Wifi className="text-green-500" size={20} />
            ) : (
              <WifiOff className="text-red-500" size={20} />
            )}
            <span className="text-sm font-medium text-gray-500">Bot holati</span>
          </div>
          <p className="text-xl font-bold">
            {webhookStatus === 'active' ? (
              <span className="text-green-600">Faol</span>
            ) : webhookStatus === 'inactive' ? (
              <span className="text-red-600">Nofaol</span>
            ) : (
              <span className="text-gray-400">Tekshirilmoqda...</span>
            )}
          </p>
          <a
            href="https://t.me/megahome_ulgurji_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
          >
            @megahome_ulgurji_bot <ExternalLink size={12} />
          </a>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="text-blue-500" size={20} />
            <span className="text-sm font-medium text-gray-500">Ulangan foydalanuvchilar</span>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-gray-400">{stats.admins} ta admin</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="text-amber-500" size={20} />
            <span className="text-sm font-medium text-gray-500">Xabar oluvchilar</span>
          </div>
          <p className="text-2xl font-bold">{stats.withNotifs}</p>
          <p className="text-xs text-gray-400">{stats.total - stats.withNotifs} ta o&apos;chirilgan</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="text-purple-500" size={20} />
            <span className="text-sm font-medium text-gray-500">Tez harakatlar</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestMessage}
            disabled={testSending}
            className="w-full text-xs"
          >
            {testSending ? 'Yuborilmoqda...' : '📨 Test xabar'}
          </Button>
        </div>
      </div>

      {/* ── Broadcast Message ── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm mb-6">
        <h3 className="text-base font-bold mb-3 flex items-center gap-2">
          <MessageSquare size={18} />
          Ommaviy xabar yuborish
        </h3>
        <div className="flex gap-3">
          <textarea
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
            rows={3}
            placeholder="Barcha ulangan foydalanuvchilarga xabar yozing..."
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
          />
          <Button
            onClick={handleBroadcast}
            disabled={sending || !broadcastText.trim()}
            className="self-end gap-2"
          >
            <Send size={16} />
            {sending ? 'Yuborilmoqda...' : 'Yuborish'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {telegramUsers.length} ta foydalanuvchiga yuboriladi. HTML formatlash qo&apos;llab-quvvatlanadi.
        </p>
      </div>

      {/* ── Users Table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Bot size={18} />
            Ulangan foydalanuvchilar ({filteredUsers.length})
          </h3>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Qidirish..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Yuklanmoqda...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <Bot size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Hali hech kim ulanmagan</p>
            <p className="text-gray-400 text-sm mt-1">
              Foydalanuvchilar @megahome_ulgurji_bot ga /start yuborishi kerak
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Foydalanuvchi</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Telefon</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Chat ID</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Buyurtma</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Aksiya</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ulangan</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.isAdmin ? 'bg-purple-500' : 'bg-green-500'}`} />
                          <span className="text-sm font-medium">{user.userName || 'Noma\'lum'}</span>
                          {user.isAdmin && (
                            <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">ADMIN</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400 font-mono">{user.chatId}</td>
                      <td className="px-4 py-3 text-center">
                        {user.settings?.orderNotifications ? (
                          <CheckCircle size={16} className="mx-auto text-green-500" />
                        ) : (
                          <XCircle size={16} className="mx-auto text-gray-300" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.settings?.promotions ? (
                          <CheckCircle size={16} className="mx-auto text-green-500" />
                        ) : (
                          <XCircle size={16} className="mx-auto text-gray-300" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {user.linkedAt?.seconds
                          ? formatDateTimeShort(user.linkedAt as any)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleUnlink(user.id, user.userName || 'Foydalanuvchi')}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Hisobni uzish"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredUsers.map((user) => (
                <div key={user.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${user.isAdmin ? 'bg-purple-500' : 'bg-green-500'}`} />
                      <span className="font-medium">{user.userName || 'Noma\'lum'}</span>
                      {user.isAdmin && (
                        <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">ADMIN</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleUnlink(user.id, user.userName || 'Foydalanuvchi')}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>📱 {user.phone || '—'}</p>
                    <div className="flex gap-3">
                      <span className="flex items-center gap-1">
                        {user.settings?.orderNotifications ? <Bell size={12} className="text-green-500" /> : <BellOff size={12} className="text-gray-300" />}
                        Buyurtma
                      </span>
                      <span className="flex items-center gap-1">
                        {user.settings?.promotions ? <Bell size={12} className="text-green-500" /> : <BellOff size={12} className="text-gray-300" />}
                        Aksiya
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Bot Info Footer ── */}
      <div className="mt-6 p-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm text-gray-500">
        <div className="flex items-center gap-2 mb-2">
          <Settings size={16} />
          <span className="font-medium">Bot sozlamalari</span>
        </div>
        <ul className="space-y-1 text-xs">
          <li>Bot: <a href="https://t.me/megahome_ulgurji_bot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">@megahome_ulgurji_bot</a></li>
          <li>Webhook: <code className="bg-gray-200 px-1 rounded">/api/telegram/webhook</code></li>
          <li>Buyruqlar: /start, /products, /cart, /order, /myorders, /reorder, /settings, /help</li>
          <li>Foydalanuvchilar telefon raqami orqali hisoblarini ulaydi</li>
        </ul>
      </div>
    </div>
  );
};

export default TelegramPage;
