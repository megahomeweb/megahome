"use client";
import { ShoppingCart, UserPlus, TrendingUp, Package, AlertTriangle, DollarSign } from "lucide-react";
import { useNotificationStore } from "@/store/useNotificationStore";
import { formatUZS } from "@/lib/formatPrice";
import Link from "next/link";
import { ShineBorder } from "@/components/ui/shine-border";
import useProductStore from "@/store/useProductStore";
import { useOrderStore } from "@/store/useOrderStore";
import { useEffect, useMemo } from "react";
import { exportLowStockProducts } from "@/lib/exportExcel";
import toast from "react-hot-toast";

const DashboardSummary = () => {
  const { notifications } = useNotificationStore();
  const { products, fetchProducts } = useProductStore();
  const { orders, fetchAllOrders } = useOrderStore();

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchAllOrders(); }, [fetchAllOrders]);

  // "Yangi" counts pulled from the orders/users themselves — single source
  // of truth. Previously this widget counted UNREAD NOTIFICATIONS
  // (`type==='new_order'`), which silently disagreed with QuickActionsWidget
  // (which counts orders with `status==='yangi'`) — two different "new"
  // numbers on the same page. We now match QuickActionsWidget so both
  // widgets show the same value.
  const unreadOrders = useMemo(
    () => orders.filter((o) => o.status === 'yangi' || !o.status),
    [orders]
  );
  // New-user count = users whose `time` is within last 24h. Falls back to
  // the notifications-based count if `users` aren't loaded here (this
  // component doesn't fetch the user collection itself).
  const unreadUsers = useMemo(
    () => notifications.filter((n) => !n.read && n.type === "new_user"),
    [notifications]
  );

  // Revenue from ALL delivered orders
  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === 'yetkazildi'),
    [orders]
  );
  const totalRevenue = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0),
    [deliveredOrders]
  );

  // Profit calculation from delivered orders
  const totalProfit = useMemo(
    () => deliveredOrders.reduce((sum, order) => {
      let orderCost = 0;
      for (const item of (order.basketItems || [])) {
        orderCost += (item.costPrice || 0) * item.quantity;
      }
      return sum + ((order.totalPrice || 0) - orderCost);
    }, 0),
    [deliveredOrders]
  );

  // Product stats
  const totalProducts = products.length;
  const lowStockCount = useMemo(
    () => products.filter((p) => {
      const hasStock = p.stock !== undefined && p.stock !== null;
      return hasStock && (p.stock as number) <= 5;
    }).length,
    [products]
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-4 px-3 sm:px-0 mb-4 sm:mb-6">
      {/* New Orders */}
      <Link href="/admin/orders">
        <ShineBorder
          color={unreadOrders.length > 0 ? ["#22c55e", "#16a34a", "#4ade80"] : ["#e5e7eb"]}
          borderWidth={unreadOrders.length > 0 ? 2 : 1}
          duration={unreadOrders.length > 0 ? 8 : 25}
          className="hover:shadow-lg transition-shadow"
        >
          <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
            <div className="flex items-start justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Yangi buyurt.</p>
                <p className="text-lg sm:text-3xl font-bold text-gray-900 mt-0.5 sm:mt-1 tabular-nums">{unreadOrders.length}</p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">Jami: {orders.length}</p>
              </div>
              <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${unreadOrders.length > 0 ? "bg-green-100" : "bg-gray-100"}`}>
                <ShoppingCart className={`size-3.5 sm:size-5 ${unreadOrders.length > 0 ? "text-green-600" : "text-gray-400"}`} />
              </div>
            </div>
          </div>
        </ShineBorder>
      </Link>

      {/* New Users */}
      <Link href="/admin/users">
        <ShineBorder
          color={unreadUsers.length > 0 ? ["#3b82f6", "#2563eb", "#60a5fa"] : ["#e5e7eb"]}
          borderWidth={unreadUsers.length > 0 ? 2 : 1}
          duration={unreadUsers.length > 0 ? 8 : 25}
          className="hover:shadow-lg transition-shadow"
        >
          <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
            <div className="flex items-start justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Yangi foyd.</p>
                <p className="text-lg sm:text-3xl font-bold text-gray-900 mt-0.5 sm:mt-1 tabular-nums">{unreadUsers.length}</p>
              </div>
              <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${unreadUsers.length > 0 ? "bg-blue-100" : "bg-gray-100"}`}>
                <UserPlus className={`size-3.5 sm:size-5 ${unreadUsers.length > 0 ? "text-blue-600" : "text-gray-400"}`} />
              </div>
            </div>
          </div>
        </ShineBorder>
      </Link>

      {/* Total Products */}
      <Link href="/admin/products">
        <ShineBorder
          color={["#8b5cf6", "#a78bfa", "#7c3aed"]}
          borderWidth={1}
          duration={25}
          className="hover:shadow-lg transition-shadow"
        >
          <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
            <div className="flex items-start justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Mahsulotlar</p>
                <p className="text-lg sm:text-3xl font-bold text-gray-900 mt-0.5 sm:mt-1 tabular-nums">{totalProducts}</p>
                {lowStockCount > 0 && (
                  <p className="text-[11px] sm:text-xs text-red-500 font-semibold mt-0.5 sm:mt-1 truncate">{lowStockCount} ta kam</p>
                )}
              </div>
              <div className="flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl bg-purple-100 shrink-0">
                <Package className="size-3.5 sm:size-5 text-purple-600" />
              </div>
            </div>
          </div>
        </ShineBorder>
      </Link>

      {/* Total Revenue */}
      <ShineBorder
        color={totalRevenue > 0 ? ["#10b981", "#059669", "#34d399"] : ["#e5e7eb"]}
        borderWidth={totalRevenue > 0 ? 2 : 1}
        duration={totalRevenue > 0 ? 10 : 25}
        className="hover:shadow-lg transition-shadow"
      >
        <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-1 sm:gap-2">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Daromad</p>
              <p className={`text-sm sm:text-2xl font-bold mt-0.5 sm:mt-1 tabular-nums truncate ${totalRevenue > 0 ? "text-green-600" : "text-gray-400"}`}>
                {totalRevenue > 0 ? formatUZS(totalRevenue) : '0$'}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">Yetkazilganlardan</p>
            </div>
            <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${totalRevenue > 0 ? "bg-emerald-100" : "bg-gray-100"}`}>
              <TrendingUp className={`size-3.5 sm:size-5 ${totalRevenue > 0 ? "text-emerald-600" : "text-gray-400"}`} />
            </div>
          </div>
        </div>
      </ShineBorder>

      {/* Profit */}
      <ShineBorder
        color={totalProfit > 0 ? ["#f59e0b", "#d97706", "#fbbf24"] : ["#e5e7eb"]}
        borderWidth={totalProfit > 0 ? 2 : 1}
        duration={totalProfit > 0 ? 10 : 25}
        className="hover:shadow-lg transition-shadow"
      >
        <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-1 sm:gap-2">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Sof foyda</p>
              <p className={`text-sm sm:text-2xl font-bold mt-0.5 sm:mt-1 tabular-nums truncate ${totalProfit > 0 ? "text-amber-600" : "text-gray-400"}`}>
                {totalProfit > 0 ? formatUZS(totalProfit) : '0$'}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
                {totalRevenue > 0 ? `Marja: ${((totalProfit / totalRevenue) * 100).toFixed(1)}%` : "Tan narxni kiriting"}
              </p>
            </div>
            <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${totalProfit > 0 ? "bg-amber-100" : "bg-gray-100"}`}>
              <DollarSign className={`size-3.5 sm:size-5 ${totalProfit > 0 ? "text-amber-600" : "text-gray-400"}`} />
            </div>
          </div>
        </div>
      </ShineBorder>

      {/* Low Stock Alert */}
      <ShineBorder
        color={lowStockCount > 0 ? ["#ef4444", "#dc2626", "#f87171"] : ["#e5e7eb"]}
        borderWidth={lowStockCount > 0 ? 2 : 1}
        duration={lowStockCount > 0 ? 6 : 25}
        className="hover:shadow-lg transition-shadow"
      >
        <Link href="/admin/products" className="block">
          <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
            <div className="flex items-start justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Kam qolgan</p>
                <p className={`text-lg sm:text-3xl font-bold mt-0.5 sm:mt-1 tabular-nums ${lowStockCount > 0 ? "text-red-600" : "text-green-600"}`}>
                  {lowStockCount}
                </p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
                  {lowStockCount > 0 ? "5 tadan kam" : "Hammasi yetarli"}
                </p>
                {lowStockCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      exportLowStockProducts(products);
                      toast.success(`${lowStockCount} ta mahsulot eksport qilindi`);
                    }}
                    className="mt-0.5 sm:mt-1 text-[10px] text-gray-400 hover:text-gray-600 underline"
                  >
                    Excel
                  </button>
                )}
              </div>
              <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${lowStockCount > 0 ? "bg-red-100" : "bg-green-100"}`}>
                <AlertTriangle className={`size-3.5 sm:size-5 ${lowStockCount > 0 ? "text-red-600" : "text-green-600"}`} />
              </div>
            </div>
          </div>
        </Link>
      </ShineBorder>
    </div>
  );
};

export default DashboardSummary;
