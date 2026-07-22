"use client";
import React, { useState, useMemo } from 'react';
import UsersTable from '@/components/admin/UsersTable';
import PanelTitle from '@/components/admin/PanelTitle';
import Search from '@/components/admin/Search';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { Users, ShieldCheck, UserPlus, UserCheck, Clock } from 'lucide-react';

const UsersPage = () => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'manager' | 'user' | 'prospect'>('all');
  const { users } = useAuthStore();
  const { notifications } = useNotificationStore();

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const managers = users.filter((u) => u.role === 'manager').length;
    const prospects = users.filter((u) => u.role === 'prospect').length;
    const regularUsers = total - admins - managers - prospects;

    // New users in last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const newToday = notifications.filter(
      (n) => n.type === 'new_user' && n.timestamp >= oneDayAgo
    ).length;

    return { total, admins, managers, prospects, regularUsers, newToday };
  }, [users, notifications]);

  return (
    <div>
      <PanelTitle title="Foydalanuvchilar" />

      {/* User Stats — mobile collapses 6-up to 3-col grid (wide row was too cramped on 360dp); md+ keeps the wide row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 px-3 sm:px-4 pb-3 sm:pb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3 min-w-0">
          <div className="flex items-center justify-center size-6 sm:size-7 rounded-lg bg-blue-100 mb-1">
            <Users className="size-3 sm:size-3.5 text-blue-600" />
          </div>
          <p className="text-base sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.total}</p>
          <p className="text-[10px] sm:text-xs text-gray-500">Jami</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3 min-w-0">
          <div className="flex items-center justify-center size-6 sm:size-7 rounded-lg bg-orange-100 mb-1">
            <Clock className="size-3 sm:size-3.5 text-orange-600" />
          </div>
          <p className="text-base sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.prospects}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 truncate">Ehtimoliy</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3 min-w-0">
          <div className="flex items-center justify-center size-6 sm:size-7 rounded-lg bg-gray-100 mb-1">
            <UserCheck className="size-3 sm:size-3.5 text-gray-600" />
          </div>
          <p className="text-base sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.regularUsers}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 truncate">Mijozlar</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3 min-w-0">
          <div className="flex items-center justify-center size-6 sm:size-7 rounded-lg bg-amber-100 mb-1">
            <UserCheck className="size-3 sm:size-3.5 text-amber-600" />
          </div>
          <p className="text-base sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.managers}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 truncate">Menejerlar</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3 min-w-0">
          <div className="flex items-center justify-center size-6 sm:size-7 rounded-lg bg-purple-100 mb-1">
            <ShieldCheck className="size-3 sm:size-3.5 text-purple-600" />
          </div>
          <p className="text-base sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.admins}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 truncate">Adminlar</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-3 min-w-0">
          <div className="flex items-center justify-center size-6 sm:size-7 rounded-lg bg-green-100 mb-1">
            <UserPlus className="size-3 sm:size-3.5 text-green-600" />
          </div>
          <p className="text-base sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.newToday}</p>
          <p className="text-[10px] sm:text-xs text-gray-500">Yangi</p>
        </div>
      </div>

      {/* Role filter — horizontally scrollable on mobile so 5 chips never wrap */}
      <div data-no-swipe className="flex gap-2 px-3 sm:px-4 pb-2 sm:pb-3 overflow-x-auto scrollbar-hide">
        {([
          { key: 'all', label: 'Barchasi' },
          { key: 'prospect', label: 'Ehtimoliy' },
          { key: 'user', label: 'Mijozlar' },
          { key: 'manager', label: 'Menejerlar' },
          { key: 'admin', label: 'Adminlar' },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setRoleFilter(f.key)}
            className={`shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
              roleFilter === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Search search={search} handleSearchChange={setSearch} placeholder="Ism yoki email bo'yicha qidirish" />
      <UsersTable search={search} roleFilter={roleFilter} />
    </div>
  );
};

export default UsersPage;
