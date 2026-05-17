"use client";
import { ShoppingCart, UserPlus, TrendingUp, TrendingDown, Package, AlertTriangle, DollarSign, HandCoins, Info } from "lucide-react";
import { useNotificationStore } from "@/store/useNotificationStore";
import { formatUZS } from "@/lib/formatPrice";
import { summarizeOrders, isCompletedSale } from "@/lib/orderMath";
import Link from "next/link";
import { ShineBorder } from "@/components/ui/shine-border";
import useProductStore from "@/store/useProductStore";
import { useOrderStore } from "@/store/useOrderStore";
import { useEffect, useMemo } from "react";
import { exportLowStockProducts } from "@/lib/exportExcel";
import { useNasiyaTotal } from "@/hooks/useNasiyaTotal";
import toast from "react-hot-toast";

const DashboardSummary = () => {
  const { notifications } = useNotificationStore();
  const { products, loading: productsLoading, fetchProducts } = useProductStore();
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

  // Canonical financial summary — uses `lib/orderMath.summarizeOrders` so
  // the dashboard, reports, charts, and customer stats can never disagree.
  // It correctly:
  //   • uses netTotal (after discounts) for revenue, not gross totalPrice
  //   • includes POS sales (source='pos') as completed even at status 'yangi'
  //   • excludes 'bekor_qilindi'
  const totals = useMemo(() => summarizeOrders(orders), [orders]);
  const totalRevenue = totals.revenue;
  const totalCost = totals.cost;
  const totalProfit = totals.profit;

  // Outstanding nasiya — REAL balance from the /nasiya collection (server
  // maintains `remaining` as customers pay), NOT the order-snapshot sum
  // (which never decreases). The order-derived figure
  // (`totals.outstandingNasiya`) is left intact for legacy callers but
  // not surfaced on this card.
  const nasiya = useNasiyaTotal();
  const outstandingNasiya = nasiya.total;

  // Product stats
  const totalProducts = products.length;
  const lowStockCount = useMemo(
    () => products.filter((p) => {
      const hasStock = p.stock !== undefined && p.stock !== null;
      return hasStock && (p.stock as number) <= 5;
    }).length,
    [products]
  );

  // "Catalog empty but historical orders still exist" — surfaces when
  // the operator has deleted (or never created) products yet the
  // dashboard still shows revenue from past order basketItems (which
  // are snapshots, so they survive the catalog being wiped). Without
  // this banner the operator sees a non-zero Daromad/Sof foyda and
  // mistakes it for a bug. The fix is: run Profil → Toʻliq factory
  // reset, OR add products back.
  const ghostRevenue =
    !productsLoading
    && totalProducts === 0
    && (orders.length > 0 || totalRevenue > 0);

  // Profit-bias warning: products that have been sold without a
  // costPrice silently inflate profit (cost defaults to 0). Surface the
  // count so the admin knows their margin is biased upward.
  const missingCostPriceProducts = useMemo(() => {
    const idsInSales = new Set<string>();
    for (const o of orders) {
      if (!isCompletedSale(o)) continue;
      for (const item of o.basketItems || []) {
        const cp = (item as { costPrice?: number }).costPrice;
        if (!cp || cp <= 0) {
          if (item.id) idsInSales.add(item.id);
        }
      }
    }
    return idsInSales.size;
  }, [orders]);

  return (
    <>
      {/* "Catalog empty but old orders still show as revenue" banner.
          See ghostRevenue calculation above for why this matters. Routes
          the operator straight to the factory-reset section in profile. */}
      {ghostRevenue && (
        <div className="mx-3 sm:mx-0 mb-3 sm:mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-start gap-2.5">
          <Info className="size-4 sm:size-5 text-red-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-semibold text-red-900">
              Mahsulot katalogi bo&apos;sh, lekin sotuv tarixi ko&apos;rinmoqda
            </p>
            <p className="text-[11px] sm:text-xs text-red-800 mt-0.5 leading-snug">
              Daromad va sof foyda eski buyurtmalardan hisoblanyapti.
              Hisobotlarni 0 ga tushirish uchun{" "}
              <Link href="/admin/profile" className="underline font-semibold whitespace-nowrap">
                Profil → To&apos;liq factory reset →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Profit-bias warning banner — shown only when sold products lack a
          costPrice. Without this, the dashboard's "Sof foyda" silently
          treats those items as free-to-acquire, overstating profit. */}
      {missingCostPriceProducts > 0 && (
        <div className="mx-3 sm:mx-0 mb-3 sm:mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-start gap-2.5">
          <Info className="size-4 sm:size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-semibold text-amber-900">
              Foyda noto&apos;g&apos;ri ko&apos;rsatilishi mumkin
            </p>
            <p className="text-[11px] sm:text-xs text-amber-800 mt-0.5 leading-snug">
              {missingCostPriceProducts} ta sotilgan mahsulotda tan narxi yo&apos;q.
              Ularning foydasi haqiqatdan yuqori chiqyapti.{" "}
              <Link href="/admin/products" className="underline font-semibold whitespace-nowrap">
                Tan narxni kiriting →
              </Link>
            </p>
          </div>
        </div>
      )}

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
                {/* Loading state must be visually distinct from
                    "genuinely empty" (count = 0). Without this, the card
                    reads identically whether the products listener is
                    still in flight or there really are zero products in
                    Firestore — operator can't tell which. */}
                {productsLoading && totalProducts === 0 ? (
                  <p className="h-7 sm:h-9 w-12 sm:w-16 mt-0.5 sm:mt-1 rounded bg-gray-200 animate-pulse" aria-label="Yuklanmoqda" />
                ) : (
                  <p className="text-lg sm:text-3xl font-bold text-gray-900 mt-0.5 sm:mt-1 tabular-nums">{totalProducts}</p>
                )}
                {totalProducts === 0 && !productsLoading ? (
                  <p className="text-[11px] sm:text-xs text-purple-600 font-semibold mt-0.5 sm:mt-1 truncate">Mahsulot qo&apos;shing</p>
                ) : lowStockCount > 0 ? (
                  <p className="text-[11px] sm:text-xs text-red-500 font-semibold mt-0.5 sm:mt-1 truncate">{lowStockCount} ta kam</p>
                ) : null}
              </div>
              <div className="flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl bg-purple-100 shrink-0">
                <Package className="size-3.5 sm:size-5 text-purple-600" />
              </div>
            </div>
          </div>
        </ShineBorder>
      </Link>

      {/* ═══ Financial trio: Daromad − Tan narxi = Sof foyda ═══════ */}
      {/* The three cards below tell one connected story. Daromad is what
          came IN, Tan narxi is what was paid OUT for the goods, and Sof foyda
          is the difference. Operators previously saw only Daromad + Sof foyda
          and the math wasn't transparent — adding Tan narxi makes it
          obvious where the money goes. */}

      {/* Daromad (Revenue) */}
      <Link href="/admin/reports">
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
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
                  {totals.count > 0 ? `${totals.count} ta sotuv` : "Tugallangan sotuvlardan"}
                </p>
              </div>
              <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${totalRevenue > 0 ? "bg-emerald-100" : "bg-gray-100"}`}>
                <TrendingUp className={`size-3.5 sm:size-5 ${totalRevenue > 0 ? "text-emerald-600" : "text-gray-400"}`} />
              </div>
            </div>
          </div>
        </ShineBorder>
      </Link>

      {/* Tan narxi (Cost of goods sold) — the bridge that makes Daromad → Sof foyda math obvious */}
      <ShineBorder
        color={["#94a3b8", "#64748b", "#cbd5e1"]}
        borderWidth={totalCost > 0 ? 2 : 1}
        duration={25}
        className="hover:shadow-lg transition-shadow"
      >
        <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-1 sm:gap-2">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Tan narxi</p>
              <p className={`text-sm sm:text-2xl font-bold mt-0.5 sm:mt-1 tabular-nums truncate ${totalCost > 0 ? "text-slate-600" : "text-gray-400"}`}>
                {totalCost > 0 ? formatUZS(totalCost) : '0$'}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">Sotilgan tovarlar</p>
            </div>
            <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${totalCost > 0 ? "bg-slate-100" : "bg-gray-100"}`}>
              <TrendingDown className={`size-3.5 sm:size-5 ${totalCost > 0 ? "text-slate-600" : "text-gray-400"}`} />
            </div>
          </div>
        </div>
      </ShineBorder>

      {/* Sof foyda (Net profit) = Daromad − Tan narxi */}
      <ShineBorder
        color={totalProfit > 0 ? ["#f59e0b", "#d97706", "#fbbf24"] : totalProfit < 0 ? ["#ef4444", "#dc2626"] : ["#e5e7eb"]}
        borderWidth={totalProfit !== 0 ? 2 : 1}
        duration={totalProfit !== 0 ? 10 : 25}
        className="hover:shadow-lg transition-shadow"
      >
        <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-1 sm:gap-2">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Sof foyda</p>
              <p className={`text-sm sm:text-2xl font-bold mt-0.5 sm:mt-1 tabular-nums truncate ${totalProfit > 0 ? "text-amber-600" : totalProfit < 0 ? "text-red-600" : "text-gray-400"}`}>
                {totalProfit !== 0 ? formatUZS(totalProfit) : '0$'}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
                {totalRevenue > 0 && totalProfit >= 0
                  ? `Marja: ${totals.margin.toFixed(1)}%`
                  : totalProfit < 0
                    ? "Zarar — narxlarni tekshiring"
                    : totalCost > 0
                      ? "Sotilgan-yo'q"
                      : "Tan narxni kiriting"}
              </p>
            </div>
            <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${totalProfit > 0 ? "bg-amber-100" : totalProfit < 0 ? "bg-red-100" : "bg-gray-100"}`}>
              <DollarSign className={`size-3.5 sm:size-5 ${totalProfit > 0 ? "text-amber-600" : totalProfit < 0 ? "text-red-600" : "text-gray-400"}`} />
            </div>
          </div>
        </div>
      </ShineBorder>

      {/* Qarzdorlik (Outstanding nasiya — money customers still owe).
          Always rendered, even at 0, so an admin can confirm "everyone
          paid up" rather than wondering whether the card is just hidden. */}
      <Link href="/admin/customers">
        <ShineBorder
          color={outstandingNasiya > 0 ? ["#a855f7", "#9333ea", "#c084fc"] : ["#e5e7eb"]}
          borderWidth={outstandingNasiya > 0 ? 2 : 1}
          duration={outstandingNasiya > 0 ? 12 : 25}
          className="hover:shadow-lg transition-shadow"
        >
          <div className="relative overflow-hidden w-full rounded-xl p-2 sm:p-4 min-w-0">
            <div className="flex items-start justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <p className="text-[11px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">Qarzdorlik</p>
                <p className={`text-sm sm:text-2xl font-bold mt-0.5 sm:mt-1 tabular-nums truncate ${outstandingNasiya > 0 ? "text-purple-600" : "text-gray-400"}`}>
                  {nasiya.loading ? '…' : (outstandingNasiya > 0 ? formatUZS(outstandingNasiya) : "Yo'q")}
                </p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
                  {outstandingNasiya > 0
                    ? `${nasiya.count} ta nasiya`
                    : nasiya.loading
                      ? 'Hisoblanmoqda…'
                      : "Hammasi to'langan"}
                </p>
              </div>
              <div className={`flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl shrink-0 ${outstandingNasiya > 0 ? "bg-purple-100" : "bg-gray-100"}`}>
                <HandCoins className={`size-3.5 sm:size-5 ${outstandingNasiya > 0 ? "text-purple-600" : "text-gray-400"}`} />
              </div>
            </div>
          </div>
        </ShineBorder>
      </Link>

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
                {/* When the catalog is empty, "Hammasi yetarli" (all
                    sufficient) is misleading — there are zero products
                    to evaluate. Show "Mahsulot yo'q" so the operator
                    knows the green check isn't a real all-clear. */}
                {productsLoading && totalProducts === 0 ? (
                  <p className="h-7 sm:h-9 w-10 sm:w-14 mt-0.5 sm:mt-1 rounded bg-gray-200 animate-pulse" aria-label="Yuklanmoqda" />
                ) : (
                  <p className={`text-lg sm:text-3xl font-bold mt-0.5 sm:mt-1 tabular-nums ${lowStockCount > 0 ? "text-red-600" : totalProducts === 0 ? "text-gray-400" : "text-green-600"}`}>
                    {lowStockCount}
                  </p>
                )}
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
                  {lowStockCount > 0
                    ? "5 tadan kam"
                    : totalProducts === 0 && !productsLoading
                      ? "Mahsulot yo'q"
                      : "Hammasi yetarli"}
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
    </>
  );
};

export default DashboardSummary;
