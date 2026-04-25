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
import { formatDateTimeShort } from "@/lib/formatDate";
import { matchesSearch } from '@/lib/searchMatch';
import { ORDER_STATUSES, getStatusInfo } from '@/lib/orderStatus';
import { OrderStatus } from '@/lib/types';
import toast from 'react-hot-toast';
import { exportOrdersToExcel } from '@/lib/exportExcel';
import { CheckCheck, Download, FileText, X, Send, MessageCircle } from 'lucide-react';
import { shareOrderToTelegram, shareOrderToWhatsApp, copyOrderText } from '@/lib/shareOrder';
import { OrderListSkeleton } from '@/components/admin/skeletons/ListSkeletons';
import { generateDeliverySheet } from '@/lib/generateDeliverySheet';
import BulkOrderStatusModal from '@/components/admin/BulkOrderStatusModal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { telegramNotify } from '@/lib/telegram/notify-client';

const StatusBadge = ({ status }: { status?: string }) => {
  const info = getStatusInfo(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${info.color} ${info.bg}`}>
      {info.label}
    </span>
  );
};

const Orders = () => {
  const { orders, fetchAllOrders, loadingOrders, updateOrderStatus, bulkUpdateOrderStatus } = useOrderStore();
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const newOrderCount = useMemo(() => orders.filter(o => o.status === 'yangi' || !o.status).length, [orders]);

  // Single source of truth for "what the operator currently sees". The Excel
  // export was previously dumping the entire `orders` collection regardless
  // of the active search — when an admin filtered to one customer to send
  // them their order history, the resulting download still contained every
  // order in the system. Now both the list and the export consume this.
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      (o.clientName ? matchesSearch(o.clientName, search) : false) ||
      (o.clientPhone ? o.clientPhone.includes(search) : false) ||
      (o.id ? o.id.toLowerCase().includes(q) : false)
    );
  }, [orders, search]);

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
      <div data-no-swipe className="flex flex-wrap gap-2 px-4 pb-3">
        {newOrderCount > 0 && (
          <Button onClick={handleConfirmAllNew} disabled={confirmingAll}
            className="rounded-xl cursor-pointer text-sm h-10 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white btn-press glow-amber px-3 sm:px-4">
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
        }} className="rounded-xl cursor-pointer text-sm h-10 gap-1.5 btn-press px-3 sm:px-4" variant="outline">
          <FileText className="size-4" /> <span className="hidden xs:inline">Yetkazish </span>varaqasi
        </Button>
        <Button
          variant="outline"
          className="rounded-xl cursor-pointer text-sm h-10 gap-1.5 px-3 sm:px-4"
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
      {loadingOrders ? (
          <div className="px-4 pb-4">
            <OrderListSkeleton rows={6} />
          </div>
        ) : (() => {
          return filteredOrders.length > 0 ? filteredOrders.map((order, idx) => (
          <Disclosure key={order.id}>
            {({ open }) => (
              <div className="mb-2">
                <div className={`flex items-center w-full px-2 sm:px-4 py-2 shadow-lg rounded-lg border border-l-4 ${
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
                    className="mr-3 size-4 accent-gray-900 cursor-pointer shrink-0"
                  />
                <DisclosureButton className="flex items-center justify-between w-full text-left">
                  <div className='flex items-start gap-2'>
                    <span className='text-sm text-gray-500 mt-1'>{idx + 1}.</span>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <h3 className="text-base font-bold capitalize">{order.clientName}</h3>
                        <p className="text-sm text-gray-500">{order.clientPhone}</p>
                      </div>
                      <StatusBadge status={order.status} />
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {order.totalQuantity} ta
                      </span>
                      <span className="text-sm font-bold text-green-600">{formatUZS(order.totalPrice)}</span>
                      <p className="text-sm text-gray-500">Sana Vaqt: {formatDateTimeShort(order.date)}</p>
                    </div>
                  </div>
                  <IoIosArrowDown
                    className={`text-xl transition-all duration-300 ${
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
                  <DisclosurePanel className="px-4 py-2 bg-gray-100">
                    {/* Status changer + financials */}
                    <div className="flex items-center gap-3 mb-3 p-3 bg-white rounded-lg border border-gray-200 flex-wrap">
                      <span className="text-sm font-semibold text-gray-700">Holati:</span>
                      <select
                        className="flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      <Link href={`/admin/invoice/${order.id}`} target="_blank">
                        <Button
                          variant="outline"
                          className="rounded-lg cursor-pointer text-xs h-7 gap-1 border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100"
                        >
                          <FileText className="size-3" /> Faktura
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => shareOrderToTelegram(order)}
                        className="rounded-lg cursor-pointer text-xs h-7 gap-1 border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      >
                        <Send className="size-3" /> Telegram
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => shareOrderToWhatsApp(order)}
                        className="rounded-lg cursor-pointer text-xs h-7 gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      >
                        <MessageCircle className="size-3" /> WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={async () => {
                          const ok = await copyOrderText(order);
                          toast.success(ok ? 'Buyurtma matni nusxalandi' : 'Nusxalab bo\'lmadi');
                        }}
                        className="rounded-lg cursor-pointer text-xs h-7 gap-1"
                      >
                        <Download className="size-3" /> Nusxalash
                      </Button>
                      <div className="ml-auto flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Jami</p>
                          <p className="text-xs font-bold text-gray-700">{order.totalQuantity} ta</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Sotish</p>
                          <p className="text-sm font-bold text-green-700">{formatUZS(order.totalPrice)}</p>
                        </div>
                        {(() => {
                          const cost = (order.basketItems || []).reduce((s, i) => s + (i.costPrice || 0) * i.quantity, 0);
                          const profit = (order.totalPrice || 0) - cost;
                          if (cost <= 0) return null;
                          return (
                            <>
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase">Tan narxi</p>
                                <p className="text-sm font-bold text-gray-500">{formatUZS(cost)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-400 uppercase">Foyda</p>
                                <p className={`text-sm font-bold ${profit > 0 ? 'text-amber-600' : 'text-red-600'}`}>{formatUZS(profit)}</p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Items table */}
                    <div data-no-swipe className="overflow-x-auto">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700">
          <span className="text-sm font-medium mr-2">{selectedOrderIds.size} ta tanlangan</span>
          <Button size="sm" variant="ghost" onClick={() => setShowBulkStatus(true)} className="text-blue-400 hover:text-blue-300 hover:bg-gray-800 gap-1.5 text-xs btn-press glow-blue">
            Statusni o&apos;zgartirish
          </Button>
          <button onClick={() => setSelectedOrderIds(new Set())} className="ml-2 p-1 rounded-lg hover:bg-gray-800">
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
