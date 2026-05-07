"use client";
import React, { useEffect, useState, useMemo } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import { useOrderStore } from '@/store/useOrderStore';
import { formatUZS } from '@/lib/formatPrice';
import { getStatusInfo } from '@/lib/orderStatus';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart3 } from 'lucide-react';
import RevenueChart from '@/components/admin/charts/RevenueChart';
import DailyOrdersChart from '@/components/admin/charts/DailyOrdersChart';

type Period = 'today' | 'week' | 'month' | 'all';

const ReportsPage = () => {
  const { orders, fetchAllOrders, loadingOrders } = useOrderStore();
  const [period, setPeriod] = useState<Period>('today');

  useEffect(() => { fetchAllOrders(); }, [fetchAllOrders]);

  const getStartDate = (p: Period): Date => {
    const now = new Date();
    switch (p) {
      case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d;
      }
      case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'all': return new Date(2000, 0, 1);
    }
  };

  const stats = useMemo(() => {
    const startDate = getStartDate(period);
    const startMs = startDate.getTime();

    let deliveredCount = 0, cancelledCount = 0, pendingCount = 0;
    let totalRevenue = 0, totalCost = 0, totalItems = 0;
    const productProfitMap: Record<string, { title: string; revenue: number; cost: number; qty: number }> = {};

    for (const o of orders) {
      const orderDate = o.date?.seconds ? o.date.seconds * 1000 : 0;
      if (orderDate < startMs) continue;

      if (o.status === 'yetkazildi') {
        deliveredCount++;
        totalRevenue += o.totalPrice || 0;
        totalItems += o.totalQuantity || 0;
        for (const item of (o.basketItems || [])) {
          const itemCost = (item.costPrice || 0) * item.quantity;
          totalCost += itemCost;
          const key = item.id || item.title;
          if (!productProfitMap[key]) {
            productProfitMap[key] = { title: item.title, revenue: 0, cost: 0, qty: 0 };
          }
          productProfitMap[key].revenue += Number(item.price) * item.quantity;
          productProfitMap[key].cost += itemCost;
          productProfitMap[key].qty += item.quantity;
        }
      } else if (o.status === 'bekor_qilindi') {
        cancelledCount++;
      } else {
        pendingCount++;
      }
    }

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const topProducts = Object.values(productProfitMap)
      .map((p) => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    return {
      totalOrders: deliveredCount + cancelledCount + pendingCount,
      deliveredCount, cancelledCount, pendingCount,
      totalRevenue, totalCost, totalProfit, profitMargin,
      totalItems, topProducts,
    };
  }, [orders, period]);

  const periods: { value: Period; label: string }[] = [
    { value: 'today', label: 'Bugun' },
    { value: 'week', label: 'Shu hafta' },
    { value: 'month', label: 'Shu oy' },
    { value: 'all', label: 'Hammasi' },
  ];

  if (loadingOrders) return <div className="flex items-center justify-center p-10">Yuklanmoqda...</div>;

  return (
    <div>
      <PanelTitle title="Hisobotlar" />
      <div className="px-3 sm:px-4 py-2 sm:py-3">
        {/* Period selector — horizontally scrollable on narrow phones */}
        <div data-no-swipe className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium cursor-pointer transition-colors ${
                period === p.value ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="size-4 text-blue-600" />
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold">Buyurtmalar</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold">{stats.totalOrders}</p>
            <div className="flex gap-2 mt-1 text-[11px]">
              <span className="text-green-600">{stats.deliveredCount} yetkazildi</span>
              <span className="text-gray-400">{stats.pendingCount} kutilmoqda</span>
              {stats.cancelledCount > 0 && <span className="text-red-500">{stats.cancelledCount} bekor</span>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="size-4 text-green-600" />
              <p className="text-xs text-gray-500 uppercase font-semibold">Daromad</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatUZS(stats.totalRevenue)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{stats.totalItems} ta mahsulot sotildi</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="size-4 text-gray-500" />
              <p className="text-xs text-gray-500 uppercase font-semibold">Tan narxi</p>
            </div>
            <p className="text-2xl font-bold text-gray-500">{formatUZS(stats.totalCost)}</p>
            <p className="text-[11px] text-gray-400 mt-1">Yetkazilgan buyurtmalardan</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="size-4 text-amber-600" />
              <p className="text-xs text-gray-500 uppercase font-semibold">Sof foyda</p>
            </div>
            <p className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
              {formatUZS(stats.totalProfit)}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Marja: {stats.profitMargin.toFixed(1)}%</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="size-4 text-emerald-600 shrink-0" />
                <h3 className="text-sm font-bold text-gray-900 truncate">Daromad tendensiyasi</h3>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-[10px] shrink-0">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Daromad</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Foyda</span>
              </div>
            </div>
            <RevenueChart orders={orders} days={period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 90} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="size-4 text-blue-600 shrink-0" />
                <h3 className="text-sm font-bold text-gray-900 truncate">Kunlik buyurtmalar</h3>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-[10px] shrink-0">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Jami</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> <span className="hidden xs:inline">Yetkazildi</span><span className="xs:hidden">Yetk.</span></span>
              </div>
            </div>
            <DailyOrdersChart orders={orders} days={period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 90} />
          </div>
        </div>

        {/* Top products by profit — desktop table, mobile cards */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-100 flex items-center gap-2">
            <BarChart3 className="size-4 text-gray-600 shrink-0" />
            <h3 className="font-bold text-sm">Eng foydali mahsulotlar</h3>
          </div>
          {stats.topProducts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Ma&apos;lumotlar mavjud emas</p>
          ) : (
            <>
              {/* Desktop table */}
              <div data-no-swipe className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">#</th>
                      <th className="text-left px-4 py-2 font-medium">Mahsulot</th>
                      <th className="text-right px-4 py-2 font-medium">Sotildi</th>
                      <th className="text-right px-4 py-2 font-medium">Daromad</th>
                      <th className="text-right px-4 py-2 font-medium">Tan narxi</th>
                      <th className="text-right px-4 py-2 font-medium">Foyda</th>
                      <th className="text-right px-4 py-2 font-medium">Marja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topProducts.map((p, idx) => {
                      const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100) : 0;
                      return (
                        <tr key={idx} className="border-t border-gray-50">
                          <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium">{p.title}</td>
                          <td className="px-4 py-2 text-right">{p.qty} ta</td>
                          <td className="px-4 py-2 text-right text-green-700 font-semibold">{formatUZS(p.revenue)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{formatUZS(p.cost)}</td>
                          <td className={`px-4 py-2 text-right font-bold ${p.profit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                            {formatUZS(p.profit)}
                          </td>
                          <td className={`px-4 py-2 text-right font-semibold ${margin >= 20 ? 'text-green-600' : margin >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                            {margin.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards — every metric visible without horizontal scroll */}
              <div className="sm:hidden divide-y divide-gray-100">
                {stats.topProducts.map((p, idx) => {
                  const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100) : 0;
                  return (
                    <div key={idx} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span className="text-xs text-gray-400 shrink-0 mt-0.5 w-5">{idx + 1}.</span>
                          <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{p.title}</p>
                        </div>
                        <span className={`text-xs font-bold shrink-0 px-1.5 py-0.5 rounded ${margin >= 20 ? 'bg-green-100 text-green-700' : margin >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 ml-7 text-[11px]">
                        <div>
                          <p className="text-gray-400">Sotildi</p>
                          <p className="font-semibold text-gray-700">{p.qty} ta</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Daromad</p>
                          <p className="font-semibold text-green-700 tabular-nums">{formatUZS(p.revenue)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Foyda</p>
                          <p className={`font-bold tabular-nums ${p.profit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{formatUZS(p.profit)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
