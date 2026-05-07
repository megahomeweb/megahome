"use client";
import React, { useMemo } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Plus,
  Truck,
  BarChart3,
  AlertTriangle,
  Package,
  Users,
} from "lucide-react";
import useProductStore from "@/store/useProductStore";
import { useOrderStore } from "@/store/useOrderStore";

const QuickActionsWidget = () => {
  const { products } = useProductStore();
  const { orders } = useOrderStore();

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "yangi" || !o.status).length,
    [orders]
  );

  const outOfStock = useMemo(
    () =>
      products.filter((p) => typeof p.stock === "number" && p.stock <= 0)
        .length,
    [products]
  );

  const lowStock = useMemo(
    () =>
      products.filter(
        (p) => typeof p.stock === "number" && p.stock > 0 && p.stock <= 5
      ).length,
    [products]
  );

  const inactiveCustomers = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const customerLastOrder = new Map<string, number>();
    for (const o of orders) {
      const ts = o.date?.seconds ? o.date.seconds * 1000 : 0;
      const current = customerLastOrder.get(o.userUid) || 0;
      if (ts > current) customerLastOrder.set(o.userUid, ts);
    }
    let inactiveCount = 0;
    for (const [, lastTs] of customerLastOrder) {
      if (lastTs > 0 && lastTs < sevenDaysAgo) inactiveCount++;
    }
    return inactiveCount;
  }, [orders]);

  const actions = [
    {
      label: "+ Buyurtma",
      href: "/admin/create-order",
      color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
      icon: ShoppingCart,
    },
    {
      label: "+ Mahsulot",
      href: "/admin/create-product",
      color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
      icon: Plus,
    },
    {
      label: "Kirim",
      href: "/admin/kirim",
      color:
        "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
      icon: Truck,
    },
    {
      label: "Hisobotlar",
      href: "/admin/reports",
      color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
      icon: BarChart3,
    },
  ];

  const attentionItems = [
    {
      count: pendingOrders,
      label: "Yangi buyurtmalar",
      color: "bg-blue-100 text-blue-700",
      icon: ShoppingCart,
    },
    {
      count: outOfStock,
      label: "Tugagan mahsulotlar",
      color: "bg-red-100 text-red-700",
      icon: AlertTriangle,
    },
    {
      count: lowStock,
      label: "Kam qolgan",
      color: "bg-yellow-100 text-yellow-700",
      icon: Package,
    },
    {
      count: inactiveCustomers,
      label: "Faolsiz mijozlar",
      color: "bg-gray-100 text-gray-600",
      icon: Users,
    },
  ];

  const visibleAttention = attentionItems.filter((item) => item.count > 0);

  return (
    <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-xl border px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition-colors ${action.color}`}
          >
            <action.icon className="size-4" />
            {action.label}
          </Link>
        ))}
      </div>

      {/* Needs Attention — horizontally scrollable on mobile so chips never wrap */}
      {visibleAttention.length > 0 && (
        <div data-no-swipe className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide sm:flex-wrap sm:overflow-visible -mx-1 px-1">
          {visibleAttention.map((item) => (
            <span
              key={item.label}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium ${item.color}`}
            >
              <item.icon className="size-3" />
              {item.count} {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuickActionsWidget;
