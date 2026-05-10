"use client"
import React, { useEffect, useMemo, useState } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import Search from '@/components/admin/Search';
import { useOrderStore } from '@/store/useOrderStore';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Transition,
} from "@headlessui/react";
import { IoIosArrowDown } from 'react-icons/io';
import Image from 'next/image';
import { formatUZS } from '@/lib/formatPrice';
import { orderRevenue, orderCost } from '@/lib/orderMath';
import { formatDateTimeShort } from "@/lib/formatDate";
import { matchesSearch } from '@/lib/searchMatch';
import { ORDER_STATUSES, getStatusInfo } from '@/lib/orderStatus';
import { OrderStatus } from '@/lib/types';
import toast from 'react-hot-toast';
import { exportOrdersToExcel } from '@/lib/exportExcel';
import { CheckCheck, Download, FileText, X, Send, MessageCircle, Filter, Trash2 } from 'lucide-react';
import { shareOrderToTelegram, shareOrderToWhatsApp, copyOrderText } from '@/lib/shareOrder';
import { OrderListSkeleton } from '@/components/admin/skeletons/ListSkeletons';
import { generateDeliverySheet } from '@/lib/generateDeliverySheet';
import BulkOrderStatusModal from '@/components/admin/BulkOrderStatusModal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { telegramNotify } from '@/lib/telegram/notify-client';

// Filter options for the orders page. `all` is a synthetic value meaning
// "no constraint on this field"; the page short-circuits each predicate
// when its filter is `all`.
type SourceFilter = 'all' | 'pos' | 'web' | 'admin' | 'telegram';
type DateFilter = 'all' | 'today' | 'week' | 'month';

const StatusBadge = ({ status }: { status?: string }) => {
  const info = getStatusInfo(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${info.color} ${info.bg}`}>
      {info.label}
    </span>
  );
};

const Orders = () => {
  const { orders, fetchAllOrders, loadingOrders, updateOrderStatus, bulkUpdateOrderStatus, deleteOrder, bulkDeleteOrders } = useOrderStore();
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Filters
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<OrderStatus | 'yangi'>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const newOrderCount = useMemo(() => orders.filter(o => o.status === 'yangi' || !o.status).length, [orders]);

  const dateThreshold = useMemo(() => {
    if (dateFilter === 'all') return 0;
    const now = new Date();
    if (dateFilter === 'today') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.getTime();
    }
    if (dateFilter === 'week') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    if (dateFilter === 'month') return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }, [dateFilter]);

  const activeFilterCount =
    (statusFilter.size > 0 ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0);

  // Single source of truth for "what the operator currently sees". The Excel
  // export was previously dumping the entire `orders` collection regardless
  // of the active search — when an admin filtered to one customer to send
  // them their order history, the resulting download still contained every
  // order in the system. Now both the list and the export consume this.
  const filteredOrders = useMemo(() => {
    let list = orders;
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.clientName ? matchesSearch(o.clientName, search) : false) ||
        (o.clientPhone ? o.clientPhone.includes(search) : false) ||
        (o.id ? o.id.toLowerCase().includes(q) : false)
      );
    }
    // Status filter (multi-select)
    if (statusFilter.size > 0) {
      list = list.filter(o => statusFilter.has((o.status ?? 'yangi') as OrderStatus));
    }
    // Source filter
    if (sourceFilter !== 'all') {
      list = list.filter(o => (o.source ?? 'web') === sourceFilter);
    }
    // Date filter
    if (dateThreshold > 0) {
      list = list.filter(o => {
        const ts = o.date?.seconds ? o.date.seconds * 1000 : 0;
        return ts >= dateThreshold;
      });
    }
    return list;
  }, [orders, search, statusFilter, sourceFilter, dateThreshold]);

  const toggleStatusFilter = (s: OrderStatus) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const clearAllFilters = () => {
    setStatusFilter(new Set());
    setSourceFilter('all');
    setDateFilter('all');
  };

  const handleDeleteOrder = async (orderId: string, clientName: string) => {
    if (!window.confirm(`"${clientName}" buyurtmasini oʻchirishni istaysizmi? Bu amalni bekor qilib boʻlmaydi. Agar buyurtma bekor qilinmagan boʻlsa, omborga qaytariladi.`)) return;
    setDeletingId(orderId);
    try {
      await deleteOrder(orderId);
      toast.success("Buyurtma oʻchirildi");
      setSelectedOrderIds(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    } catch (err) {
      console.error(err);
      toast.error("Oʻchirishda xatolik");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOrderIds.size === 0) return;
    if (!window.confirm(`${selectedOrderIds.size} ta buyurtma oʻchiriladi. Bekor qilinmaganlari uchun ombor qaytariladi. Davom etamizmi?`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedOrderIds);
      const result = await bulkDeleteOrders(ids);
      toast.success(`${result.success} ta oʻchirildi${result.failed > 0 ? `, ${result.failed} ta xatolik` : ''}`);
      setSelectedOrderIds(new Set());
    } catch (err) {
      console.error(err);
      toast.error("Toʻplam oʻchirishda xatolik");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleConfirmAllNew = async () => {
    const newOrders = orders.filter(o => o.status === 'yangi' || !o.status);
    if (newOrders.length === 0) return;
    setConfirmingAll(true);
    try {
      const result = await bulkUpdateOrderStatus(newOrders.map(o => o.id), 'tasdiqlangan');
      toast.success(`${result.success} ta buyurtma tasdiqlandi`);
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setConfirmingAll(false);
    }
  };

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  useEffect(() => {
    fetchAllOrders();
  }, [fetchAllOrders]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      const info = getStatusInfo(newStatus);
      toast.success(`Buyurtma holati: ${info.label}`);
      // Notify customer via Telegram
      const order = orders.find((o) => o.id === orderId);
      if (order) {
        telegramNotify('order_status_changed', {
          orderId,
          clientName: order.clientName,
          totalPrice: order.totalPrice,
          userUid: order.userUid,
          newStatus,
        });
      }
    } catch {
      toast.error("Holatni yangilashda xatolik");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <PanelTitle title="Buyurtmalar" />
      <Search search={search} handleSearchChange={setSearch} placeholder="Buyurtmalarni qidirish" />
      <div data-no-swipe className="flex flex-wrap gap-1.5 sm:gap-2 px-3 sm:px-4 pb-2 sm:pb-3">
        {newOrderCount > 0 && (
          <Button onClick={handleConfirmAllNew} disabled={confirmingAll}
            className="rounded-xl cursor-pointer text-xs sm:text-sm h-9 sm:h-10 gap-1 sm:gap-1.5 bg-amber-500 hover:bg-amber-600 text-white btn-press glow-amber px-2.5 sm:px-4">
            <CheckCheck className="size-4" />
            {confirmingAll ? "..." : `${newOrderCount} ta tasdiqlash`}
          </Button>
        )}
        <Button onClick={() => {
          const deliveryOrders = selectedOrderIds.size > 0
            ? orders.filter(o => selectedOrderIds.has(o.id))
            : orders.filter(o => o.status === 'tasdiqlangan' || o.status === 'yetkazilmoqda');
          if (deliveryOrders.length === 0) { toast.error("Yetkazish uchun buyurtma yo'q"); return; }
          generateDeliverySheet(deliveryOrders);
          toast.success(`${deliveryOrders.length} ta buyurtma uchun varaqasi yaratildi`);
        }} className="rounded-xl cursor-pointer text-xs sm:text-sm h-9 sm:h-10 gap-1 sm:gap-1.5 btn-press px-2.5 sm:px-4" variant="outline">
          <FileText className="size-4" /> <span className="hidden xs:inline">Yetkazish </span>varaqasi
        </Button>
        <Button
          variant="outline"
          className={`rounded-xl cursor-pointer text-xs sm:text-sm h-9 sm:h-10 gap-1 sm:gap-1.5 px-2.5 sm:px-4 ${
            activeFilterCount > 0 ? 'border-blue-400 bg-blue-50 text-blue-700' : ''
          }`}
          onClick={() => setShowFilterPanel(v => !v)}
        >
          <Filter className="size-4" />
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center size-4 text-[10px] font-bold rounded-full bg-blue-600 text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Button
          variant="outline"
          className="rounded-xl cursor-pointer text-xs sm:text-sm h-9 sm:h-10 gap-1 sm:gap-1.5 px-2.5 sm:px-4"
          onClick={() => {
            if (filteredOrders.length === 0) {
              toast.error("Eksport qilinadigan buyurtma yo'q");
              return;
            }
            const fileName = search.trim()
              ? `buyurtmalar_qidiruv_${search.trim().slice(0, 20)}`
              : 'buyurtmalar';
            exportOrdersToExcel(filteredOrders, fileName);
            toast.success(`${filteredOrders.length} ta buyurtma eksport qilindi`);
          }}
        >
          <Download className="size-4" /> Excel
        </Button>
      </div>

      {/* Filter panel — collapsible, no horizontal scroll on mobile.
          Status chips wrap; date + source are short selects so they fit
          inline on phones. Designed to be tap-friendly: every chip is
          ≥36px tall. */}
      {showFilterPanel && (
        <div data-no-swipe className="mx-3 sm:mx-4 mb-3 p-3 sm:p-4 bg-white border border-gray-200 rounded-xl space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Holat</p>
            <div className="flex flex-wrap gap-1.5">
              {ORDER_STATUSES.map((s) => {
                const active = statusFilter.has(s.value as OrderStatus);
                return (
                  <button
                    key={s.value}
                    onClick={() => toggleStatusFilter(s.value as OrderStatus)}
                    className={`h-9 px-3 rounded-lg text-xs font-semibold transition border ${
                      active
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Manba</p>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">Hammasi</option>
                <option value="pos">POS (sotuv nuqtasi)</option>
                <option value="web">Web sayt</option>
                <option value="telegram">Telegram</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Sana</p>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">Hammasi</option>
                <option value="today">Bugun</option>
                <option value="week">Oxirgi 7 kun</option>
                <option value="month">Oxirgi 30 kun</option>
              </select>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-500">
                {filteredOrders.length} ta buyurtma topildi
              </span>
              <button
                onClick={clearAllFilters}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Filtrlarni tozalash
              </button>
            </div>
          )}
        </div>
      )}
      {loadingOrders ? (
          <div className="px-4 pb-4">
            <OrderListSkeleton rows={6} />
          </div>
        ) : (() => {
          return filteredOrders.length > 0 ? filteredOrders.map((order, idx) => (
          <Disclosure key={order.id}>
            {({ open }) => (
              <div className="mb-2 mx-3 sm:mx-0">
                <div className={`flex items-center w-full px-2 sm:px-4 py-2 shadow-lg rounded-lg border border-l-4 gap-2 ${
                  order.status === 'yetkazildi' ? 'border-l-green-500' :
                  order.status === 'yangi' || !order.status ? 'border-l-blue-500' :
                  order.status === 'tasdiqlangan' ? 'border-l-amber-500' :
                  order.status === 'bekor_qilindi' ? 'border-l-red-500' :
                  order.status === 'yetkazilmoqda' ? 'border-l-orange-500' :
                  'border-l-purple-500'
                } ${selectedOrderIds.has(order.id) ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-gray-200'}`}>
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.has(order.id)}
                    onChange={() => toggleSelectOrder(order.id)}
                    className="size-4 accent-gray-900 cursor-pointer shrink-0"
                  />
                <DisclosureButton className="flex items-center justify-between w-full text-left gap-2 min-w-0">
                  {/* Mobile: 2-line compact layout — name + price on top, phone + status pill + qty + date on bottom.
                      Desktop (sm+): single horizontal flex with all chips inline. */}
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className='text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1 shrink-0'>{idx + 1}.</span>
                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4 sm:flex-wrap">
                      <div className="flex items-center justify-between gap-2 min-w-0 sm:flex-none">
                        <div className="min-w-0 flex-1 sm:flex-none">
                          <h3 className="text-sm sm:text-base font-bold capitalize truncate">{order.clientName}</h3>
                          <p className="text-xs sm:text-sm text-gray-500 truncate">{order.clientPhone}</p>
                        </div>
                        {/* Price pinned to right on mobile so it always reads at a glance */}
                        <span className="sm:hidden text-sm font-bold text-green-600 tabular-nums shrink-0">{formatUZS(order.totalPrice)}</span>
                      </div>
                      <div className="mt-1 sm:mt-0 flex items-center gap-1.5 sm:gap-3 flex-wrap">
                        <StatusBadge status={order.status} />
                        <span className="text-[10px] sm:text-xs bg-gray-100 text-gray-600 px-1.5 sm:px-2 py-0.5 rounded-full">
                          {order.totalQuantity} ta
                        </span>
                        <span className="hidden sm:inline text-sm font-bold text-green-600">{formatUZS(order.totalPrice)}</span>
                        <p className="text-[10px] sm:text-sm text-gray-500 truncate">{formatDateTimeShort(order.date)}</p>
                      </div>
                    </div>
                  </div>
                  <IoIosArrowDown
                    className={`text-lg sm:text-xl transition-all duration-300 shrink-0 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </DisclosureButton>
                </div>
                <Transition
                  show={open}
                  enter="transition-all duration-300 ease-in-out"
                  enterFrom="transform opacity-0 max-h-0"
                  enterTo="transform opacity-100 max-h-[600px]"
                  leave="transition-all duration-300 ease-in-out"
                  leaveFrom="transform opacity-100 max-h-[600px]"
                  leaveTo="transform opacity-0 max-h-0"
                >
                  <DisclosurePanel className="px-2 sm:px-4 py-2 bg-gray-100">
                    {/* Status changer + share actions — wraps on mobile, stacks chips into a horizontally scrollable strip when very narrow */}
                    <div className="mb-2 sm:mb-3 p-2 sm:p-3 bg-white rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 shrink-0">Holati:</span>
                        <select
                          className="flex-1 min-w-[140px] max-w-xs border border-gray-300 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
                          value={order.status || 'yangi'}
                          onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                          disabled={updatingId === order.id}
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        {updatingId === order.id && (
                          <span className="inline-block w-4 h-4 border-2 border-t-transparent border-primary rounded-full animate-spin" />
                        )}
                      </div>
                      <div data-no-swipe className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto scrollbar-hide sm:flex-wrap sm:overflow-visible -mx-1 px-1">
                        <Link href={`/admin/invoice/${order.id}`} target="_blank" className="shrink-0">
                          <Button variant="outline" className="rounded-lg cursor-pointer text-xs h-7 gap-1 border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100">
                            <FileText className="size-3" /> Faktura
                          </Button>
                        </Link>
                        <Button variant="outline" type="button" onClick={() => shareOrderToTelegram(order)}
                          className="rounded-lg cursor-pointer text-xs h-7 gap-1 border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 shrink-0">
                          <Send className="size-3" /> Telegram
                        </Button>
                        <Button variant="outline" type="button" onClick={() => shareOrderToWhatsApp(order)}
                          className="rounded-lg cursor-pointer text-xs h-7 gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shrink-0">
                          <MessageCircle className="size-3" /> WhatsApp
                        </Button>
                        <Button variant="outline" type="button" onClick={async () => {
                            const ok = await copyOrderText(order);
                            toast.success(ok ? 'Buyurtma matni nusxalandi' : 'Nusxalab bo\'lmadi');
                          }} className="rounded-lg cursor-pointer text-xs h-7 gap-1 shrink-0">
                          <Download className="size-3" /> Nusxalash
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          disabled={deletingId === order.id}
                          onClick={() => handleDeleteOrder(order.id, order.clientName)}
                          className="rounded-lg cursor-pointer text-xs h-7 gap-1 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 shrink-0 disabled:opacity-50"
                        >
                          <Trash2 className="size-3" />
                          {deletingId === order.id ? "Oʻchirilmoqda..." : "Oʻchirish"}
                        </Button>
                      </div>
                      {/* Financials — 2-col grid on mobile, inline on desktop */}
                      <div className="grid grid-cols-2 sm:flex sm:items-center sm:gap-4 sm:justify-end mt-2 pt-2 border-t border-gray-100 gap-x-3 gap-y-1.5 text-right">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Jami</p>
                          <p className="text-xs font-bold text-gray-700">{order.totalQuantity} ta</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Sotish</p>
                          <p className="text-xs sm:text-sm font-bold text-green-700">{formatUZS(orderRevenue(order))}</p>
                        </div>
                        {(() => {
                          const cost = orderCost(order);
                          const profit = orderRevenue(order) - cost;
                          if (cost <= 0) return null;
                          return (
                            <>
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase">Tan narxi</p>
                                <p className="text-xs sm:text-sm font-bold text-gray-500">{formatUZS(cost)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase">Foyda</p>
                                <p className={`text-xs sm:text-sm font-bold ${profit > 0 ? 'text-amber-600' : 'text-red-600'}`}>{formatUZS(profit)}</p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Items: desktop table, mobile cards (no horizontal scroll required) */}
                    <div data-no-swipe className="hidden sm:block overflow-x-auto">
                      <table className="min-w-full text-left table-auto">
                        <thead>
                          <tr>
                            <th scope="col" className="h-12 px-6 text-md border-l first:border-l-0 border-pink-100 text-slate-700 bg-slate-100 font-bold fontPara">S.No.</th>
                            <th scope="col" className="h-12 px-6 text-md border-l first:border-l-0 border-pink-100 text-slate-700 bg-slate-100 font-bold fontPara">Rasm</th>
                            <th scope="col" className="h-12 px-6 text-md font-bold fontPara border-l first:border-l-0 border-pink-100 text-slate-700 bg-slate-100">Nomi</th>
                            <th scope="col" className="h-12 px-6 text-md font-bold fontPara border-l first:border-l-0 border-pink-100 text-slate-700 bg-slate-100">Narxi</th>
                            <th scope="col" className="h-12 px-6 text-md font-bold fontPara border-l first:border-l-0 border-pink-100 text-slate-700 bg-slate-100">Soni</th>
                            <th scope="col" className="h-12 px-6 text-md font-bold fontPara border-l first:border-l-0 border-pink-100 text-slate-700 bg-slate-100">Kategoriya</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.basketItems.map((item, index) => {
                            const { title, price, category, quantity, productImageUrl } = item;
                            return (
                              <tr key={index} className="text-pink-300">
                                <td className="h-12 px-6 text-md transition duration-300 border-t border-l first:border-l-0 border-pink-100 stroke-slate-500 text-slate-500">{index + 1}.</td>
                                <td className="h-12 px-6 text-md transition duration-300 border-t border-l first:border-l-0 border-pink-100 stroke-slate-500 text-slate-500 first-letter:uppercase">
                                  <div className="flex justify-center">
                                    <Image width={80} height={80} className="w-20" src={productImageUrl?.[0]?.url || ''} alt="" />
                                  </div>
                                </td>
                                <td className="h-12 px-6 text-md transition duration-300 border-t border-l first:border-l-0 border-pink-100 stroke-slate-500 text-slate-500 first-letter:uppercase">{title}</td>
                                <td className="h-12 px-6 text-md transition duration-300 border-t border-l first:border-l-0 border-pink-100 stroke-slate-500 text-slate-500 first-letter:uppercase font-semibold">{formatUZS(price)}</td>
                                <td className="h-12 px-6 text-md transition duration-300 border-t border-l first:border-l-0 border-pink-100 stroke-slate-500 text-slate-500 first-letter:uppercase">{quantity}</td>
                                <td className="h-12 px-6 text-md transition duration-300 border-t border-l first:border-l-0 border-pink-100 stroke-slate-500 text-slate-500 first-letter:uppercase">{category}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="sm:hidden space-y-1.5">
                      {order.basketItems.map((item, index) => {
                        const { title, price, category, quantity, productImageUrl } = item;
                        return (
                          <div key={index} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-2">
                            <span className="text-[10px] text-gray-400 shrink-0 w-4">{index + 1}.</span>
                            {productImageUrl?.[0]?.url ? (
                              <Image width={36} height={36} className="size-9 rounded-md object-cover shrink-0" src={productImageUrl[0].url} alt="" />
                            ) : (
                              <div className="size-9 rounded-md bg-gray-100 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-900 truncate first-letter:uppercase">{title}</p>
                              <p className="text-[10px] text-gray-500 truncate">{category} · {quantity} ta</p>
                            </div>
                            <span className="text-xs font-bold text-gray-700 tabular-nums shrink-0">{formatUZS(price)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </DisclosurePanel>
                </Transition>
              </div>
            )}
          </Disclosure>
        )) : (
          <div className="flex items-center justify-center py-10 text-gray-500">
            {search ? `"${search}" bo'yicha buyurtma topilmadi` : 'Buyurtmalar mavjud emas'}
          </div>
        );
        })()}

      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-2 right-2 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 z-50 flex items-center gap-1.5 sm:gap-3 bg-gray-900 text-white px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-2xl border border-gray-700 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:pb-3 overflow-x-auto scrollbar-hide"
          style={{ maxWidth: "calc(100vw - 1rem)" }}>
          <span className="text-xs sm:text-sm font-medium mr-1 sm:mr-2 shrink-0">{selectedOrderIds.size} ta</span>
          <Button size="sm" variant="ghost" onClick={() => setShowBulkStatus(true)} className="text-blue-400 hover:text-blue-300 hover:bg-gray-800 gap-1.5 text-xs btn-press glow-blue shrink-0">
            Statusni oʻzgartirish
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkDeleting}
            onClick={handleBulkDelete}
            className="text-red-400 hover:text-red-300 hover:bg-gray-800 gap-1.5 text-xs btn-press shrink-0 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            {bulkDeleting ? "Oʻchirilmoqda..." : "Oʻchirish"}
          </Button>
          <button onClick={() => setSelectedOrderIds(new Set())} className="ml-1 sm:ml-2 p-1 rounded-lg hover:bg-gray-800 shrink-0" aria-label="Bekor qilish">
            <X className="size-4 text-gray-400" />
          </button>
        </div>
      )}

      {showBulkStatus && (
        <BulkOrderStatusModal
          selectedOrderIds={Array.from(selectedOrderIds)}
          onClose={() => {
            setShowBulkStatus(false);
            setSelectedOrderIds(new Set());
          }}
        />
      )}
    </div>
  );
};

export default Orders;
