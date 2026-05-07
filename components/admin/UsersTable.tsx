"use client"
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { BiTrash, BiUser } from 'react-icons/bi';
import { Phone, ShoppingCart } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import type { UserData } from '@/store/authStore';
import { useOrderStore } from '@/store/useOrderStore';
import toast from 'react-hot-toast';
import { updateDoc, doc } from 'firebase/firestore';
import { fireDB, auth } from '@/firebase/config';
import { useNotificationStore } from '@/store/useNotificationStore';
import { formatUZS } from '@/lib/formatPrice';
import { matchesSearch } from '@/lib/searchMatch';
import Link from 'next/link';
import Pagination, { usePagination } from './Pagination';

const roleOptions = ["admin", "manager", "user"];
const roleLabels: Record<string, string> = {
  admin: "Admin",
  manager: "Menejer",
  user: "Foydalanuvchi",
};
const roleBadge: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-amber-100 text-amber-700",
  user: "bg-gray-100 text-gray-600",
};

interface UsersTableProps {
  search: string;
  roleFilter?: 'all' | 'admin' | 'manager' | 'user';
}

const Spinner = () => (
  <span className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 rounded-xl">
    <span className="inline-block w-6 h-6 border-2 border-t-transparent border-blue-500 rounded-full animate-spin" />
  </span>
);

const UsersTable = ({ search, roleFilter = 'all' }: UsersTableProps) => {
  const { users, fetchAllUsers } = useAuthStore();
  const { orders } = useOrderStore();
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const { isNewUser } = useNotificationStore();
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = fetchAllUsers() as (() => void) | undefined;
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fetchAllUsers]);

  // Pre-compute order stats per user
  const userStats = useMemo(() => {
    const stats: Record<string, { orderCount: number; totalSpent: number }> = {};
    for (const order of orders) {
      const key = order.userUid;
      if (!key) continue;
      if (!stats[key]) stats[key] = { orderCount: 0, totalSpent: 0 };
      stats[key].orderCount++;
      if (order.status === 'yetkazildi') {
        stats[key].totalSpent += order.totalPrice || 0;
      }
    }
    return stats;
  }, [orders]);

  const filteredUsers = useMemo(() => {
    let filtered = users;
    if (roleFilter !== 'all') {
      filtered = filtered.filter((u: UserData) => u.role === roleFilter);
    }
    if (search.length >= 2) {
      filtered = filtered.filter((u: UserData) =>
        matchesSearch(u.name, search) ||
        (u.email ? matchesSearch(u.email, search) : false) ||
        (u.phone ? u.phone.includes(search) : false)
      );
    }
    const admins = filtered.filter((u: UserData) => u.role === 'admin');
    const managers = filtered.filter((u: UserData) => u.role === 'manager');
    const others = filtered
      .filter((u: UserData) => u.role !== 'admin' && u.role !== 'manager')
      .sort((a: UserData, b: UserData) => {
        if (a.time && b.time) return b.time - a.time;
        return 0;
      });
    return [...admins, ...managers, ...others];
  }, [users, search, roleFilter]);

  const { page, perPage, setPage, setPerPage, pageItems, total } = usePagination(filteredUsers, 25);

  const handleDelete = async (user: UserData) => {
    // Hard-delete is irreversible: removes Firebase Auth account + Firestore
    // user doc (and may break referential integrity in orders/nasiya). Without
    // a confirm prompt, a stray click on the trash icon vaporizes a customer
    // and all their identity data.
    if (!window.confirm(
      `${user.name} ni o'chirmoqchimisiz?\n\nBu amalni qaytarib bo'lmaydi. Foydalanuvchining akkaunti, kirish huquqi va profil ma'lumotlari butunlay o'chiriladi.`
    )) return;
    setLoadingUserId(user.uid);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) { toast.error("Avtorizatsiya xatosi"); setLoadingUserId(null); return; }
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ uid: user.uid }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Foydalanuvchi o'chirildi");
        if (fetchAllUsers) fetchAllUsers();
      } else {
        toast.error(data.error || "O'chirishda xatolik");
      }
    } catch {
      toast.error("O'chirishda xatolik");
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleRoleChange = async (user: UserData, newRole: string) => {
    if (newRole === user.role) return;
    // Confirm any role change — promoting to admin grants full panel access
    // (delete users, drop products, see profit margins, change prices). The
    // dropdown is only one tap away from disaster, so make the operator
    // explicitly acknowledge what they're doing.
    const isElevation =
      (user.role === 'user' && (newRole === 'admin' || newRole === 'manager')) ||
      (user.role === 'manager' && newRole === 'admin');
    const isDemotion = user.role === 'admin' && newRole !== 'admin';
    let message = `${user.name} ning rolini ${roleLabels[user.role] || user.role} → ${roleLabels[newRole]} ga o'zgartirmoqchimisiz?`;
    if (isElevation && newRole === 'admin') {
      message += "\n\n⚠️ Admin barcha mahsulot, buyurtma va foydalanuvchilarni boshqarishi mumkin.";
    } else if (isDemotion) {
      message += "\n\n⚠️ Admin huquqlari olib tashlanadi. Foydalanuvchi endi admin panelga kira olmaydi.";
    }
    if (!window.confirm(message)) return;
    setLoadingUserId(user.uid);
    try {
      const userDoc = doc(fireDB, 'user', user.uid);
      await updateDoc(userDoc, { role: newRole });
      toast.success(`${user.name} → ${roleLabels[newRole]}`);
      if (fetchAllUsers) fetchAllUsers();
    } catch {
      toast.error("Rolni yangilashda xatolik");
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <div className="w-full px-3 sm:px-4 py-2 sm:py-3">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Foydalanuvchi</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Aloqa</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Buyurtmalar</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Jami xarid</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Maqom</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-16"></th>
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={6} className="h-20 px-4 py-2 text-center text-gray-400 text-sm">
                  {search.length >= 2 ? "Foydalanuvchi topilmadi" : "Foydalanuvchilar mavjud emas"}
                </td>
              </tr>
            ) : (pageItems.map((user: UserData) => {
              const isNew = isNewUser(user.uid);
              const stats = userStats[user.uid];
              return (
              <tr key={user.uid} className={`border-t border-gray-100 hover:bg-gray-50/50 ${isNew ? 'bg-blue-50/40' : ''}`}>
                {/* User info */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center size-9 rounded-full shrink-0 ${isNew ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      <BiUser className={`size-4 ${isNew ? 'text-blue-600' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <p className={`text-sm text-gray-900 ${isNew ? 'font-bold' : 'font-medium'}`}>
                        {user.name}
                        {isNew && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500 text-white animate-pulse">
                            YANGI
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                {/* Contact */}
                <td className="px-4 py-3">
                  {user.phone ? (
                    <a href={`tel:${user.phone}`} className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600 transition-colors">
                      <Phone className="size-3.5" />
                      {user.phone}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                {/* Order count */}
                <td className="px-4 py-3 text-center">
                  {stats?.orderCount ? (
                    <Link href={`/admin/orders`} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                      <ShoppingCart className="size-3.5" />
                      {stats.orderCount}
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">0</span>
                  )}
                </td>
                {/* Total spent */}
                <td className="px-4 py-3 text-right">
                  {stats?.totalSpent ? (
                    <span className="text-sm font-semibold text-green-600">{formatUZS(stats.totalSpent)}</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                {/* Role */}
                <td className="px-4 py-3 text-center">
                  <select
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${roleBadge[user.role] || roleBadge.user}`}
                    value={user.role}
                    onChange={e => handleRoleChange(user, e.target.value)}
                  >
                    {roleOptions.map(role => (
                      <option key={role} value={role}>{roleLabels[role]}</option>
                    ))}
                  </select>
                </td>
                {/* Delete */}
                <td className="px-4 py-3 text-center">
                  <Button
                    onClick={() => handleDelete(user)}
                    disabled={loadingUserId === user.uid}
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-red-600 cursor-pointer"
                  >
                    <BiTrash size={18} />
                  </Button>
                </td>
              </tr>
              );
            }))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {total === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-400 text-sm">
            {search.length >= 2 ? "Foydalanuvchi topilmadi" : "Foydalanuvchilar mavjud emas"}
          </div>
        ) : (pageItems.map((user: UserData) => {
          const isNew = isNewUser(user.uid);
          const stats = userStats[user.uid];
          return (
          <div key={user.uid} className={`relative bg-white rounded-xl border p-4 ${isNew ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}>
            {loadingUserId === user.uid && <Spinner />}

            {/* Header: avatar + name + role badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex items-center justify-center size-9 rounded-full shrink-0 ${isNew ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <BiUser className={`size-4 ${isNew ? 'text-blue-600' : 'text-gray-500'}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm truncate ${isNew ? 'font-bold' : 'font-medium'}`}>
                    {user.name}
                    {isNew && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500 text-white animate-pulse">YANGI</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${roleBadge[user.role] || roleBadge.user}`}>
                {roleLabels[user.role] || user.role}
              </span>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {/* Phone */}
              <div>
                {user.phone ? (
                  <a href={`tel:${user.phone}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600">
                    <Phone className="size-3 shrink-0" />
                    <span className="truncate">{user.phone}</span>
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">Tel yo&apos;q</span>
                )}
              </div>
              {/* Orders */}
              <div className="text-center">
                <p className="text-xs text-gray-400">Buyurtmalar</p>
                <p className="text-sm font-bold">{stats?.orderCount || 0}</p>
              </div>
              {/* Spent */}
              <div className="text-right">
                <p className="text-xs text-gray-400">Xarid</p>
                <p className="text-sm font-bold text-green-600">
                  {stats?.totalSpent ? formatUZS(stats.totalSpent) : '—'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <select
                className={`flex-1 text-xs font-bold px-3 py-1.5 rounded-lg border-0 cursor-pointer ${roleBadge[user.role] || roleBadge.user}`}
                value={user.role}
                onChange={e => handleRoleChange(user, e.target.value)}
              >
                {roleOptions.map(role => (
                  <option key={role} value={role}>{roleLabels[role]}</option>
                ))}
              </select>
              <Button
                onClick={() => handleDelete(user)}
                disabled={loadingUserId === user.uid}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-red-600 cursor-pointer shrink-0"
              >
                <BiTrash size={16} />
              </Button>
            </div>
          </div>
          );
        }))}
      </div>

      {/* Pagination */}
      <Pagination
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
      />
    </div>
  );
};

export default UsersTable;
