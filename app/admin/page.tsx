"use client";
import { useEffect, useMemo } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import DashboardSummary from '@/components/admin/DashboardSummary';
import QuickActionsWidget from '@/components/admin/QuickActionsWidget';
import RevenueChart from '@/components/admin/charts/RevenueChart';
import OrderStatusChart from '@/components/admin/charts/OrderStatusChart';
import DailyOrdersChart from '@/components/admin/charts/DailyOrdersChart';
import { useOrderStore } from '@/store/useOrderStore';
import { formatUZS } from '@/lib/formatPrice';
import { getStatusInfo } from '@/lib/orderStatus';
import Link from 'next/link';
import { ArrowRight, TrendingUp, BarChart3 } from 'lucide-react';

const Dashboard = () => {
  const { orders, fetchAllOrders } = useOrderStore();

  useEffect(() => {
    fetchAllOrders();
  }, [fetchAllOrders]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
      .slice(0, 6);
  }, [orders]);

  return (
    <div>
      <PanelTitle title="Bosh sahifa" />
      <QuickActionsWidget />
      <DashboardSummary />

      {/* Charts Section */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Revenue Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp className="size-4 text-emerald-600 shrink-0" />
              <h3 className="text-sm font-bold text-gray-900 truncate">Daromad va foyda</h3>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-[10px] shrink-0">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Daromad</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Foyda</span>
            </div>
          </div>
          <RevenueChart orders={orders} days={14} />
        </div>

        {/* Order Status Donut */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="size-4 text-blue-600 shrink-0" />
            <h3 className="text-sm font-bold text-gray-900 truncate">Buyurtmalar holati</h3>
          </div>
          <OrderStatusChart orders={orders} />
        </div>
      </div>

      {/* Daily Orders Bar Chart */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
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
          <DailyOrdersChart orders={orders} days={14} />
        </div>
      </div>

      {/* Recent Orders */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h2 className="text-sm font-bold text-gray-900">Oxirgi buyurtmalar</h2>
          <Link href="/admin/orders" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors">
            Barchasini ko&apos;rish <ArrowRight className="size-3" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Buyurtmalar mavjud emas</p>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((order) => {
              const statusInfo = getStatusInfo(order.status);
              const date = order.date?.seconds
                ? new Date(order.date.seconds * 1000).toLocaleDateString('uz-UZ')
                : '';
              return (
                <div key={order.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-3 sm:px-4 py-2.5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-1 h-8 rounded-full shrink-0 ${
                      order.status === 'yetkazildi' ? 'bg-green-500' :
                      order.status === 'yangi' || !order.status ? 'bg-blue-500' :
                      order.status === 'bekor_qilindi' ? 'bg-red-500' :
                      'bg-amber-500'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 capitalize truncate">{order.clientName}</p>
                      <p className="text-xs text-gray-400">{date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="text-xs text-gray-500 hidden sm:inline">{order.totalQuantity} ta</span>
                    <span className="text-sm font-bold text-gray-900">{formatUZS(order.totalPrice)}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold ${statusInfo.color} ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
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

export default Dashboard;
