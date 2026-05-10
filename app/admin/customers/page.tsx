"use client";
import React, { useEffect, useMemo, useState } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import Search from '@/components/admin/Search';
import Pagination, { usePagination } from '@/components/admin/Pagination';
import { useOrderStore } from '@/store/useOrderStore';
import { useAuthStore } from '@/store/authStore';
import type { UserData } from '@/store/authStore';
import { formatUZS } from '@/lib/formatPrice';
import { isCompletedSale, orderRevenue, orderCost } from '@/lib/orderMath';
import { matchesSearch } from '@/lib/searchMatch';
import { canonicalPhone, formatUzPhone } from '@/lib/phone';
import { Crown, TrendingUp, ShoppingCart, Phone, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportCustomersToExcel } from '@/lib/importExcel';
import { CustomerListSkeleton } from '@/components/admin/skeletons/ListSkeletons';

const CustomersPage = () => {
  const { orders, fetchAllOrders, loadingOrders } = useOrderStore();
  const { users, fetchAllUsers } = useAuthStore();

  useEffect(() => { fetchAllOrders(); }, [fetchAllOrders]);
  useEffect(() => {
    const unsub = fetchAllUsers() as (() => void) | undefined;
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [fetchAllUsers]);

  const customerStats = useMemo(() => {
    const statsMap: Record<string, {
      user: UserData | null;
      name: string;
      phone: string;
      totalOrders: number;
      deliveredOrders: number;
      totalSpent: number;
      totalProfit: number;
      lastOrderDate: number;
    }> = {};

    // Build a uid → user lookup AND a canonical-phone → user lookup so
    // that a pre-signup order placed with phone X and a post-signup
    // order placed with uid Y (same person, same phone) collapse to a
    // single ranking row instead of double-counting.
    const userByUid = new Map<string, UserData>();
    const userByPhone = new Map<string, UserData>();
    for (const u of users) {
      if (u.uid) userByUid.set(u.uid, u);
      const ph = canonicalPhone(u.phone);
      if (ph && !userByPhone.has(ph)) userByPhone.set(ph, u);
    }

    for (const order of orders) {
      // Resolve the order to a customer using the strongest signal
      // available, in priority order:
      //   1. userUid → look up in the user collection
      //   2. canonical(clientPhone) → look up the same way
      //   3. fall back to canonical phone alone (no user doc yet)
      //   4. fall back to the raw phone (unparseable / international)
      //   5. last resort: lowercased clientName
      // The KEY is the dedupe identity. Two orders that resolve to the
      // same key share a stats row.
      const phoneKey = canonicalPhone(order.clientPhone);
      const matchedUser =
        (order.userUid && userByUid.get(order.userUid)) ||
        (phoneKey && userByPhone.get(phoneKey)) ||
        null;
      const dedupeKey =
        matchedUser?.uid ||
        phoneKey ||
        (order.clientPhone || '').trim() ||
        (order.clientName || '').trim().toLowerCase() ||
        order.id;

      if (!statsMap[dedupeKey]) {
        statsMap[dedupeKey] = {
          user: matchedUser,
          name: matchedUser?.name || order.clientName || 'Mijoz',
          phone: formatUzPhone(matchedUser?.phone || order.clientPhone),
          totalOrders: 0,
          deliveredOrders: 0,
          totalSpent: 0,
          totalProfit: 0,
          lastOrderDate: 0,
        };
      } else if (!statsMap[dedupeKey].user && matchedUser) {
        // We saw an anonymous order first, then matched the same person
        // via uid on a later order — promote the row to the linked user
        // so name/phone reflect the canonical profile.
        statsMap[dedupeKey].user = matchedUser;
        if (matchedUser.name) statsMap[dedupeKey].name = matchedUser.name;
        if (matchedUser.phone) statsMap[dedupeKey].phone = formatUzPhone(matchedUser.phone);
      }
      const s = statsMap[dedupeKey];
      s.totalOrders++;
      const orderDate = order.date?.seconds ? order.date.seconds * 1000 : 0;
      if (orderDate > s.lastOrderDate) s.lastOrderDate = orderDate;

      // "Spent / profit" tally uses the same definition the dashboard uses:
      // a completed sale is delivered web-order OR a POS sale, valued at
      // netTotal (after promo + ticket discount), not gross totalPrice.
      if (isCompletedSale(order)) {
        s.deliveredOrders++;
        const rev = orderRevenue(order);
        s.totalSpent += rev;
        s.totalProfit += rev - orderCost(order);
      }
    }

    return Object.values(statsMap)
      .filter((s) => s.totalOrders > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders, users]);

  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const customerActivity = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    const lastOrderMap = new Map<string, number>();
    for (const o of orders) {
      const ts = o.date?.seconds ? o.date.seconds * 1000 : 0;
      const current = lastOrderMap.get(o.userUid) || 0;
      if (ts > current) lastOrderMap.set(o.userUid, ts);
    }
    return (uid: string) => {
      const last = lastOrderMap.get(uid);
      if (!last) return { status: 'new', label: 'Yangi', color: 'text-gray-500', dot: 'bg-gray-400' };
      const days = Math.floor((now - last) / DAY);
      if (days <= 7) return { status: 'active', label: 'Faol', color: 'text-green-600', dot: 'bg-green-500' };
      if (days <= 14) return { status: 'cooling', label: 'Sovumoqda', color: 'text-yellow-600', dot: 'bg-yellow-500' };
      if (days <= 30) return { status: 'at-risk', label: 'Xavfli', color: 'text-red-600', dot: 'bg-red-500' };
      return { status: 'inactive', label: 'Faolsiz', color: 'text-gray-500', dot: 'bg-gray-400' };
    };
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    let list = customerStats;
    if (activityFilter !== 'all') {
      list = list.filter((c) => {
        const key = c.user?.uid || c.phone;
        const activity = customerActivity(key);
        return activity.status === activityFilter;
      });
    }
    if (search.length >= 2) {
      list = list.filter((c) =>
        matchesSearch(c.name, search) ||
        (c.phone ? c.phone.includes(search) : false)
      );
    }
    return list;
  }, [customerStats, activityFilter, customerActivity, search]);

  const { page, perPage, setPage, setPerPage, pageItems, total } = usePagination(filteredCustomers, 25);

  if (loadingOrders) {
    return (
      <div>
        <PanelTitle title="Mijozlar reytingi" />
        <div className="px-4 py-3">
          <CustomerListSkeleton rows={5} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PanelTitle title="Mijozlar reytingi" />
      {customerStats.length > 0 && (
        <div className="px-3 sm:px-4 pb-2 sm:pb-3">
          <Button
            variant="outline"
            className="rounded-xl cursor-pointer text-xs h-8 gap-1 max-w-full"
            onClick={() => {
              // Export what the operator is actually looking at — when they've
              // filtered to "Xavfli" customers to run a re-engagement
              // campaign, dumping every customer in the system defeats the
              // entire workflow. `filteredCustomers` honours both the
              // activity-tier filter and the name/phone search.
              if (filteredCustomers.length === 0) return;
              exportCustomersToExcel(filteredCustomers);
            }}
          >
            <Download className="size-3.5" />
            {activityFilter !== 'all' || search.length >= 2
              ? `${filteredCustomers.length} ta filtrlangan mijozni yuklab olish`
              : 'Mijozlarni Excel yuklab olish'}
          </Button>
        </div>
      )}

      {/* Search */}
      <Search search={search} handleSearchChange={setSearch} placeholder="Mijoz ismi yoki telefon..." />

      {/* Activity filter tabs */}
      <div data-no-swipe className="px-3 sm:px-4 pb-2 sm:pb-3 overflow-x-auto scrollbar-hide -mb-px">
        <div className="flex gap-2 min-w-max">
          {[
            { key: 'all', label: 'Barchasi' },
            { key: 'active', label: 'Faol' },
            { key: 'cooling', label: 'Sovumoqda' },
            { key: 'at-risk', label: 'Xavfli' },
            { key: 'inactive', label: 'Faolsiz' },
          ].map((f) => (
            <button key={f.key} onClick={() => setActivityFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${
                activityFilter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 sm:px-4 py-2 sm:py-3">
        {total === 0 ? (
          <p className="text-gray-500 text-center py-10 text-sm">
            {search.length >= 2 ? 'Mijoz topilmadi' : 'Mijozlar mavjud emas'}
          </p>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {pageItems.map((customer, localIdx) => {
              const idx = (page - 1) * perPage + localIdx;
              const rank = idx + 1;
              const isTop3 = activityFilter === 'all' && search.length < 2 && rank <= 3;
              const crownColor = rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : 'text-amber-700';
              const customerKey = customer.user?.uid || customer.phone;
              const activity = customerActivity(customerKey);
              return (
                <div
                  key={idx}
                  className={`bg-white rounded-xl border p-3 sm:p-4 min-w-0 ${isTop3 ? 'border-yellow-200 shadow-md' : 'border-gray-200'}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center size-9 sm:size-10 rounded-full font-bold text-sm shrink-0 ${
                        isTop3 ? 'bg-yellow-100' : 'bg-gray-100'
                      }`}>
                        {isTop3 ? <Crown className={`size-4 sm:size-5 ${crownColor}`} /> : rank}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-bold ${isTop3 ? 'text-base sm:text-lg' : 'text-sm'} flex items-center`}>
                          <span className={`inline-block size-2.5 rounded-full ${activity.dot} mr-2 shrink-0`} title={activity.label} />
                          <span className="truncate">{customer.name}</span>
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Phone className="size-3 shrink-0" /> {customer.phone}
                          <span className={`ml-2 text-[10px] font-medium ${activity.color}`}>{activity.label}</span>
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Buyurtmalar</p>
                        <p className="font-bold text-sm flex items-center gap-1">
                          <ShoppingCart className="size-3.5 text-gray-400" /> {customer.totalOrders}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Xaridlar</p>
                        <p className="font-bold text-sm text-green-600">{formatUZS(customer.totalSpent)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Foyda</p>
                        <p className="font-bold text-sm text-amber-600 flex items-center gap-1">
                          <TrendingUp className="size-3.5" /> {formatUZS(customer.totalProfit)}
                        </p>
                      </div>
                      {customer.lastOrderDate > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Oxirgi</p>
                          <p className="text-xs text-gray-600">{new Date(customer.lastOrderDate).toLocaleDateString('uz-UZ')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {total > 0 && (
          <Pagination
            total={total}
            page={page}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        )}
      </div>
    </div>
  );
};

export default CustomersPage;
