"use client"
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { fireDB } from '@/firebase/config';
import { Order } from '@/lib/types';
import { formatUZS } from '@/lib/formatPrice';
import { orderRevenue } from '@/lib/orderMath';
import { formatDateUz, formatTimeUz } from "@/lib/formatDate";
import { getStatusInfo } from '@/lib/orderStatus';
import { Printer, Share2, Copy, Link as LinkIcon, MapPin, Banknote } from 'lucide-react';
import { FaTelegram, FaWhatsapp } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */
function InvoiceSkeleton() {
  return (
    <div className="max-w-[800px] mx-auto">
      {/* Action bar skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-36 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-10 w-44 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Header skeleton */}
        <div className="bg-gray-900 px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-7 w-56 bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-40 bg-gray-700 rounded animate-pulse mt-2" />
            </div>
            <div className="text-right">
              <div className="h-4 w-28 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-32 bg-gray-700 rounded animate-pulse mt-2" />
            </div>
          </div>
        </div>
        {/* Date bar skeleton */}
        <div className="flex items-center justify-between px-8 py-3 bg-gray-50 border-b border-gray-200">
          <div className="h-4 w-52 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 w-24 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        {/* Customer skeleton */}
        <div className="px-8 py-5 border-b border-gray-200">
          <div className="h-3 w-32 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="h-3 w-12 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
            </div>
            <div>
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-5 w-36 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
        {/* Table skeleton */}
        <div className="px-8 py-5">
          <div className="h-3 w-40 bg-gray-200 rounded animate-pulse mb-4" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-100">
              <div className="h-4 w-6 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-40 bg-gray-200 rounded animate-pulse flex-1" />
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Totals skeleton */}
        <div className="px-8 py-5 border-t-2 border-gray-200">
          <div className="flex flex-col items-end gap-2">
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-56 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        {/* Footer skeleton */}
        <div className="px-8 py-5 bg-gray-50 border-t border-gray-200">
          <div className="h-4 w-36 bg-gray-200 rounded animate-pulse mx-auto" />
          <div className="h-3 w-48 bg-gray-200 rounded animate-pulse mx-auto mt-2" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
const InvoicePage = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const orderDoc = await getDoc(doc(fireDB, 'orders', id));
        if (orderDoc.exists()) {
          setOrder({ id: orderDoc.id, ...orderDoc.data() } as Order);
        }
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [id]);

  // IMPORTANT: All hooks must be called before any early returns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    if (shareOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [shareOpen]);

  /* ---------- Loading state ---------- */
  if (loading) {
    return <InvoiceSkeleton />;
  }

  /* ---------- Not found ---------- */
  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Buyurtma topilmadi</p>
      </div>
    );
  }

  /* ---------- Computed values ---------- */
  const statusInfo = getStatusInfo(order.status);
  const invoiceNumber = `MH-${order.id.slice(-6).toUpperCase()}`;

  const items = order.basketItems || [];

  const totalQuantity = order.totalQuantity;
  // Use net total (after promo + ticket discount) when present so the
  // invoice's "Profit" reflects what the customer actually paid, not the
  // gross subtotal.
  const totalPrice = orderRevenue(order);
  const grossPrice = order.totalPrice;
  const discountTotal = grossPrice - totalPrice;

  // Cost & profit (only if costPrice available on at least one item)
  const hasCostData = items.some((item) => item.costPrice != null && item.costPrice > 0);
  const totalCost = hasCostData
    ? items.reduce((sum, item) => {
        const cost = item.costPrice ?? 0;
        return sum + cost * item.quantity;
      }, 0)
    : 0;
  const profit = totalPrice - totalCost;

  const invoiceUrl = typeof window !== "undefined" ? window.location.href : "";
  const invoiceShareText = `Schyot-faktura ${invoiceNumber} | ${order.clientName} | ${formatUZS(totalPrice)} | MegaHome Ulgurji`;

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(invoiceUrl)}&text=${encodeURIComponent(invoiceShareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  const handleShareWhatsapp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(invoiceShareText + " " + invoiceUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  const handleCopyInvoiceLink = async () => {
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      toast.success("Havola nusxalandi!");
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
    setShareOpen(false);
  };

  /* ---------- Render ---------- */
  return (
    <div>
      {/* Action buttons — hidden during print */}
      <div className="print:hidden flex items-center justify-between mb-4 max-w-[800px] mx-auto">
        <h1 className="text-2xl font-black">Schyot-faktura</h1>
        <div className="flex items-center gap-2">
          {/* Share dropdown */}
          <div ref={shareRef} className="relative">
            <Button
              onClick={() => setShareOpen((prev) => !prev)}
              variant="outline"
              className="rounded-xl cursor-pointer gap-2"
            >
              <Share2 className="size-4" />
              Ulashish
            </Button>
            <div
              className={`absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px] overflow-hidden transition-all duration-200 origin-top-right ${
                shareOpen
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
              }`}
            >
              <button
                type="button"
                onClick={handleShareTelegram}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 transition-colors duration-150 cursor-pointer"
              >
                <FaTelegram className="text-[#229ED9] text-lg" />
                <span>Telegram orqali yuborish</span>
              </button>
              <button
                type="button"
                onClick={handleShareWhatsapp}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-green-50 transition-colors duration-150 cursor-pointer"
              >
                <FaWhatsapp className="text-[#25D366] text-lg" />
                <span>WhatsApp orqali yuborish</span>
              </button>
              <div className="border-t border-gray-100" />
              <button
                type="button"
                onClick={handleCopyInvoiceLink}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
              >
                <LinkIcon className="size-[18px] text-gray-500" />
                <span>Havolani nusxalash</span>
              </button>
            </div>
          </div>
          <Button
            onClick={() => window.print()}
            className="rounded-xl cursor-pointer gap-2 bg-black text-white hover:bg-black/90"
          >
            <Printer className="size-4" />
            Chop etish / PDF
          </Button>
        </div>
      </div>

      {/* Invoice document */}
      <div className="bg-white border border-gray-200 rounded-2xl print:rounded-none print:border-0 print:shadow-none overflow-hidden max-w-[800px] mx-auto">

        {/* ── Header ── */}
        <div
          className="bg-gray-900 text-white px-8 py-6 print:bg-gray-900 print:text-white"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight">MEGAHOME ULGURJI</h2>
              <p className="text-gray-400 text-sm mt-0.5">Ulgurji savdo platformasi</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">SCHYOT-FAKTURA</p>
              <p className="text-xl font-bold mt-0.5">{invoiceNumber}</p>
            </div>
          </div>
        </div>

        {/* ── Date / Time / Status bar ── */}
        <div
          className="flex items-center justify-between px-8 py-3 bg-gray-50 border-b border-gray-200"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <p>
              <span className="font-semibold">Sana:</span>{' '}
              {formatDateUz(order.date)}
            </p>
            <p>
              <span className="font-semibold">Vaqt:</span>{' '}
              {formatTimeUz(order.date)}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold ${statusInfo.color} ${statusInfo.bg}`}
            style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
          >
            {statusInfo.label}
          </span>
        </div>

        {/* ── Customer info (two-column) ── */}
        <div className="px-8 py-5 border-b border-gray-200">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Mijoz ma&apos;lumotlari
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Mijoz</p>
              <p className="font-bold text-gray-900 capitalize">{order.clientName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Telefon</p>
              <p className="font-bold text-gray-900">{order.clientPhone}</p>
            </div>
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="px-8 py-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Buyurtma tafsilotlari
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 font-semibold text-gray-600 w-8">#</th>
                <th className="text-left py-2 font-semibold text-gray-600">Mahsulot</th>
                <th className="text-left py-2 font-semibold text-gray-600">Kategoriya</th>
                <th className="text-right py-2 font-semibold text-gray-600">Birlik narxi</th>
                <th className="text-center py-2 font-semibold text-gray-600 w-16">Soni</th>
                <th className="text-right py-2 font-semibold text-gray-600">Jami</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const unitPrice = Number(item.price);
                const subtotal = unitPrice * item.quantity;
                return (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 text-gray-500">{idx + 1}</td>
                    <td className="py-3 font-medium text-gray-900">{item.title}</td>
                    <td className="py-3 text-gray-500">{item.category}</td>
                    <td className="py-3 text-right text-gray-700">{formatUZS(unitPrice)}</td>
                    <td className="py-3 text-center text-gray-700">{item.quantity}</td>
                    <td className="py-3 text-right font-semibold text-gray-900">{formatUZS(subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Financial summary ── */}
        <div className="px-8 py-5 border-t-2 border-gray-200">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-8 text-sm">
              <span className="text-gray-500">Jami mahsulotlar:</span>
              <span className="font-bold text-gray-900 w-40 text-right">{totalQuantity} ta</span>
            </div>
            <div className="flex items-center gap-8 text-lg mt-1">
              <span className="font-semibold text-gray-700">Jami summa:</span>
              <span className="font-black text-gray-900 w-40 text-right">{formatUZS(totalPrice)}</span>
            </div>

            {hasCostData && (
              <>
                <div className="w-full max-w-xs border-t border-dashed border-gray-300 my-2" />
                <div className="flex items-center gap-8 text-sm">
                  <span className="text-gray-500">Tan narxi:</span>
                  <span className="font-bold text-gray-900 w-40 text-right">{formatUZS(totalCost)}</span>
                </div>
                <div className="flex items-center gap-8 text-sm">
                  <span className="text-gray-500">Foyda:</span>
                  <span className={`font-bold w-40 text-right ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatUZS(profit)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Stamp / Signature line ── */}
        <div className="px-8 py-4 border-t border-gray-200">
          <div className="flex items-end justify-between text-sm text-gray-500 pt-4">
            <span>M.O. _________________</span>
            <span>Imzo _________________</span>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="px-8 py-5 bg-gray-50 border-t border-gray-200 text-center"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
          <p className="text-sm font-bold text-gray-700">MEGAHOME ULGURJI</p>
          <p className="text-xs text-gray-400 mt-0.5">Xaridingiz uchun rahmat!</p>
        </div>
      </div>
    </div>
  );
};

export default InvoicePage;
