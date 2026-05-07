"use client"
import React, { useEffect, useState, useMemo } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import Search from '@/components/admin/Search';
import { useOrderStore } from '@/store/useOrderStore';
import { formatUZS } from '@/lib/formatPrice';
import { formatDateTimeShort } from "@/lib/formatDate";
import { getStatusInfo } from '@/lib/orderStatus';
import { FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { InvoiceListSkeleton } from '@/components/admin/skeletons/ListSkeletons';

const getStartDate = (p: string): number => {
  const now = new Date();
  if (p === 'today') { now.setHours(0,0,0,0); return now.getTime(); }
  if (p === 'week') { const d = now.getDay(); now.setDate(now.getDate() - d + (d===0?-6:1)); now.setHours(0,0,0,0); return now.getTime(); }
  if (p === 'month') { return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
  return 0;
};

const InvoicesPage = () => {
  const { orders, fetchAllOrders, loadingOrders } = useOrderStore();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAllOrders();
  }, [fetchAllOrders]);

  const filteredOrders = useMemo(() => {
    const startMs = getStartDate(period);
    let result = orders.filter((o) => {
      const orderMs = o.date?.seconds ? o.date.seconds * 1000 : 0;
      if (orderMs < startMs) return false;
      if (search.length >= 2) {
        const q = search.toLowerCase();
        return o.clientName?.toLowerCase().includes(q) || o.clientPhone?.includes(q) || o.id?.toLowerCase().includes(q);
      }
      return true;
    });
    result.sort((a, b) => {
      if (sortBy === 'amount') return (b.totalPrice || 0) - (a.totalPrice || 0);
      return (b.date?.seconds || 0) - (a.date?.seconds || 0);
    });
    return result;
  }, [orders, period, search, sortBy]);

  if (loadingOrders) {
    return (
      <div>
        <PanelTitle title="Schyot-fakturalar" />
        <div className="px-4 py-3">
          <InvoiceListSkeleton rows={6} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PanelTitle title="Schyot-fakturalar" />
      <Search search={search} handleSearchChange={setSearch} placeholder="Mijoz nomi, telefon yoki ID bo'yicha qidirish" />

      <div className="px-3 sm:px-4 py-2 sm:py-3">
        <div data-no-swipe className="flex gap-2 mb-3 sm:mb-4 overflow-x-auto scrollbar-hide sm:flex-wrap sm:overflow-visible">
          {[
            { key: 'today', label: 'Bugun' },
            { key: 'week', label: 'Shu hafta' },
            { key: 'month', label: 'Shu oy' },
            { key: 'all', label: 'Barchasi' },
          ].map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key as any)}
              className={`shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                period === p.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        <div data-no-swipe className="flex gap-2 mb-3 sm:mb-4">
          <button onClick={() => setSortBy('date')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${sortBy === 'date' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Sana bo&apos;yicha
          </button>
          <button onClick={() => setSortBy('amount')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${sortBy === 'amount' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Summa bo&apos;yicha
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-3">{filteredOrders.length} ta faktura</p>

        {selectedInvoiceIds.size > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <Button onClick={() => {
              const ids = Array.from(selectedInvoiceIds).slice(0, 10);
              ids.forEach(id => window.open(`/admin/invoice/${id}`, '_blank'));
              toast.success(`${ids.length} ta faktura ochildi`);
            }} className="rounded-xl text-xs h-8 gap-1.5 bg-gray-900 text-white">
              <Printer className="size-3.5" /> {selectedInvoiceIds.size} ta chop etish
            </Button>
            <button onClick={() => setSelectedInvoiceIds(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600">
              Bekor qilish
            </button>
          </div>
        )}
      </div>

      <div className="px-3 sm:px-4 py-2 sm:py-3">
        {filteredOrders.length === 0 ? (
          <p className="text-gray-500 text-center py-10 text-sm">Buyurtmalar topilmadi</p>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order, idx) => {
              const statusInfo = getStatusInfo(order.status);
              const date = formatDateTimeShort(order.date);
              const invoiceNum = order.id.slice(-8).toUpperCase();

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-gray-200 px-2.5 sm:px-4 py-2.5 sm:py-3"
                >
                  {/* Mobile: 2-row compact layout (top: ☑ # name + price/Faktura, bottom: phone + date + status pill).
                      Desktop (sm+): single-row flex with 4 trailing columns. */}
                  <div className="flex items-center gap-2 sm:gap-3 sm:justify-between sm:flex-wrap">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.has(order.id)}
                        onChange={() => {
                          const next = new Set(selectedInvoiceIds);
                          if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                          setSelectedInvoiceIds(next);
                        }}
                        className="size-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer shrink-0"
                      />
                      <span className="hidden sm:inline text-sm text-gray-400 font-medium w-6 shrink-0">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-gray-900 capitalize truncate">
                          {order.clientName}
                        </p>
                        <p className="text-[11px] sm:text-xs text-gray-500 truncate">{order.clientPhone}</p>
                      </div>
                    </div>

                    {/* Right cluster — wraps to its own line on narrow phones */}
                    <div className="flex items-center gap-2 sm:gap-4 flex-wrap shrink-0">
                      <div className="hidden sm:block text-right">
                        <p className="text-xs text-gray-400">#{invoiceNum}</p>
                        <p className="text-xs text-gray-500">{date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{formatUZS(order.totalPrice)}</p>
                        <p className="text-[11px] sm:text-xs text-gray-500">{order.totalQuantity} ta</p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-bold ${statusInfo.color} ${statusInfo.bg}`}
                      >
                        {statusInfo.label}
                      </span>
                      <Link href={`/admin/invoice/${order.id}`} target="_blank">
                        <Button
                          variant="outline"
                          className="rounded-xl cursor-pointer text-[11px] sm:text-xs h-7 sm:h-8 gap-1 border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100 hover:text-teal-800 px-2 sm:px-3"
                        >
                          <FileText className="size-3 sm:size-3.5" /> Faktura
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {/* Mobile-only meta row */}
                  <div className="sm:hidden flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100 text-[10px] text-gray-400">
                    <span>#{invoiceNum}</span>
                    <span>{date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoicesPage;
