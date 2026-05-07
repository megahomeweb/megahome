"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Bell, ShoppingCart, UserPlus, X, CheckCheck, ChevronDown, Phone, Mail, User, Package, BarChart3, TrendingUp, AlertTriangle, ShoppingBag } from "lucide-react";
import { useNotificationStore, Notification } from "@/store/useNotificationStore";
import { Button } from "@/components/ui/button";
import { formatUZS } from "@/lib/formatPrice";
import toast from "react-hot-toast";
import { playOrderSound, playUserSound } from "@/lib/notificationSound";
import { getStatusInfo } from "@/lib/orderStatus";

const NotificationPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(-1);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    startListening,
    stopListening,
  } = useNotificationStore();

  useEffect(() => {
    startListening();
    return () => stopListening();
  }, [startListening, stopListening]);

  // Instant toast + sound when new notifications arrive
  // prevCountRef starts at -1 to skip the initial mount (persisted unread count).
  // On first render we just record the current count without firing toasts.
  useEffect(() => {
    if (prevCountRef.current === -1) {
      // First render: sync ref with current persisted count, don't fire toast
      prevCountRef.current = unreadCount;
      return;
    }

    if (unreadCount > prevCountRef.current) {
      const newest = notifications[0];
      if (newest && !newest.read) {
        const isOrder = newest.type === "new_order";
        const isUser = newest.type === "new_user";
        const isStatusChange = newest.type === "order_status_change";
        const isSummaryType = newest.type === "daily_summary";

        // Play sound based on type
        if (isSummaryType) playOrderSound();
        else if (isOrder) playOrderSound();
        else if (isStatusChange) playOrderSound();
        else playUserSound();

        // Color scheme
        const bgClass = isSummaryType ? "bg-teal-100" : isOrder ? "bg-green-100" : isStatusChange ? "bg-amber-100" : "bg-blue-100";
        const iconClass = isSummaryType ? "text-teal-600" : isOrder ? "text-green-600" : isStatusChange ? "text-amber-600" : "text-blue-600";
        const textClass = isSummaryType ? "text-teal-600" : isOrder ? "text-green-600" : isStatusChange ? "text-amber-600" : "text-blue-600";
        const borderColor = isSummaryType ? "#99f6e4" : isOrder ? "#bbf7d0" : isStatusChange ? "#fde68a" : "#bfdbfe";

        toast(
          (t) => (
            <div
              className="flex items-start gap-3 cursor-pointer max-w-sm"
              onClick={() => {
                toast.dismiss(t.id);
                setIsOpen(true);
              }}
            >
              <div className="shrink-0 mt-0.5">
                <div className={`flex items-center justify-center size-9 rounded-full ${bgClass}`}>
                  {isSummaryType
                    ? <BarChart3 className={`size-4 ${iconClass}`} />
                    : isUser
                    ? <UserPlus className={`size-4 ${iconClass}`} />
                    : <ShoppingCart className={`size-4 ${iconClass}`} />
                  }
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">{newest.title}</p>
                <p className={`text-xs font-semibold mt-0.5 ${textClass}`}>{newest.message}</p>
                {newest.detail && <p className="text-[11px] text-gray-400 mt-0.5">{newest.detail}</p>}
              </div>
            </div>
          ),
          {
            duration: isOrder ? 8000 : 5000,
            position: "top-right",
            style: {
              background: "#fff",
              border: `1px solid ${borderColor}`,
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
              padding: "16px 20px",
              fontSize: "14px",
              borderRadius: "14px",
              maxWidth: "420px",
            },
          }
        );
      }
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, notifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatTime = useCallback((timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Hozir";
    if (minutes < 60) return `${minutes} daqiqa oldin`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} soat oldin`;
    const days = Math.floor(hours / 24);
    return `${days} kun oldin`;
  }, []);

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        aria-label="Bildirishnomalar"
      >
        <Bell className="size-6 text-gray-700" />
        {unreadCount > 0 && (
          <>
            <span className="absolute top-0 right-0 size-3 bg-red-500 rounded-full animate-ping opacity-75" />
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-6 h-6 px-1 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-[calc(100vw-1rem)] sm:w-[400px] md:w-[460px] max-w-[calc(100vw-1rem)] max-h-[min(600px,calc(100dvh-6rem))] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-base text-gray-900">
              Bildirishnomalar
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium cursor-pointer"
              >
                <CheckCheck className="size-3.5" />
                Barchasini o&apos;qish
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[460px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Bell className="size-10 mb-3 opacity-30" />
                <p className="text-sm">Bildirishnomalar yo&apos;q</p>
              </div>
            ) : (
              <NotificationList
                notifications={notifications}
                onRead={markAsRead}
                onRemove={removeNotification}
                formatTime={formatTime}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Paginated Notification List ---
const INITIAL_COUNT = 50;
const LOAD_MORE_COUNT = 20;

const NotificationList = ({
  notifications,
  onRead,
  onRemove,
  formatTime,
}: {
  notifications: Notification[];
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
  formatTime: (ts: number) => string;
}) => {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const visibleNotifications = useMemo(
    () => notifications.slice(0, visibleCount),
    [notifications, visibleCount]
  );
  const hasMore = notifications.length > visibleCount;

  return (
    <>
      {visibleNotifications.map((notif) => (
        <NotificationItem
          key={notif.id}
          notification={notif}
          onRead={onRead}
          onRemove={onRemove}
          formatTime={formatTime}
        />
      ))}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + LOAD_MORE_COUNT)}
          className="w-full py-2.5 text-xs font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Ko&apos;proq ko&apos;rish ({notifications.length - visibleCount} ta qoldi)
        </button>
      )}
    </>
  );
};

// --- Expandable Notification Item ---
const NotificationItem = React.memo(({
  notification,
  onRead,
  onRemove,
  formatTime,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
  formatTime: (ts: number) => string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isOrder = notification.type === "new_order";
  const isStatusChange = notification.type === "order_status_change";
  const isUser = notification.type === "new_user";
  const isSummary = notification.type === "daily_summary";

  const handleClick = () => {
    if (!notification.read) onRead(notification.id);
    setExpanded((prev) => !prev);
  };

  // Color scheme per type
  const colorMap = isSummary
    ? { bg: "bg-teal-50/40", circle: "bg-teal-100", icon: "text-teal-600", dot: "bg-teal-500", text: "text-teal-700", border: "border-l-4 border-teal-500" }
    : isOrder
    ? { bg: "bg-green-50/40", circle: "bg-green-100", icon: "text-green-600", dot: "bg-green-500", text: "text-green-700", border: "border-l-4 border-green-500" }
    : isStatusChange
    ? { bg: "bg-amber-50/40", circle: "bg-amber-100", icon: "text-amber-600", dot: "bg-amber-500", text: "text-amber-700", border: "border-l-4 border-amber-500" }
    : { bg: "bg-blue-50/40", circle: "bg-blue-100", icon: "text-blue-600", dot: "bg-blue-500", text: "text-blue-700", border: "border-l-4 border-blue-500" };

  const NotifIcon = isSummary ? BarChart3 : isUser ? UserPlus : ShoppingCart;

  return (
    <div
      className={`group relative border-b border-gray-100 transition-colors ${colorMap.border} ${
        !notification.read ? colorMap.bg : "hover:bg-gray-50"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5 px-4 py-3.5 cursor-pointer" onClick={handleClick}>
        <div className={`shrink-0 mt-0.5 flex items-center justify-center size-10 rounded-xl ${colorMap.circle}`}>
          <NotifIcon className={`size-4 ${colorMap.icon}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {!notification.read && (
              <span className={`inline-block w-3 h-3 rounded-full shrink-0 animate-pulse ${colorMap.dot}`} />
            )}
            <span className="font-bold text-sm text-gray-900 truncate">{notification.title}</span>
          </div>
          <p className={`text-sm text-gray-600 mt-0.5`}>
            {notification.message}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {notification.detail} &middot; {formatTime(notification.timestamp)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <ChevronDown className={`size-4 text-gray-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {isSummary && notification.summaryData ? (
            <SummaryDetails data={notification.summaryData} />
          ) : (isOrder || isStatusChange) && notification.orderData ? (
            <OrderDetails data={notification.orderData} />
          ) : notification.userData ? (
            <UserDetails data={notification.userData} />
          ) : (
            <p className="text-xs text-gray-400 px-2 py-2">Ma&apos;lumotlar mavjud emas</p>
          )}
        </div>
      )}

      {/* Remove button */}
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(notification.id);
        }}
        className="absolute top-2 right-2 size-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="O'chirish"
      >
        <X className="size-3.5 text-gray-400" />
      </Button>
    </div>
  );
});
NotificationItem.displayName = "NotificationItem";

// --- Order Details Expanded View ---
const OrderDetails = ({ data }: { data: NonNullable<Notification["orderData"]> }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Customer info + status */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <User className="size-3.5 text-gray-500" />
          <span className="text-xs font-bold text-gray-800">{data.clientName}</span>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const info = getStatusInfo(data.status);
            return (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${info.color} ${info.bg}`}>
                {info.label}
              </span>
            );
          })()}
          <Phone className="size-3 text-gray-400" />
          <span className="text-xs text-gray-600">{data.clientPhone}</span>
        </div>
      </div>

      {/* Items list */}
      <div className="divide-y divide-gray-50">
        {data.basketItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2.5 px-3 py-2">
            {item.productImageUrl && item.productImageUrl[0] ? (
              <img
                src={item.productImageUrl?.[0]?.url || ''}
                alt={item.title}
                className="size-9 rounded-md object-cover shrink-0"
              />
            ) : (
              <div className="size-9 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                <Package className="size-4 text-gray-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
              <p className="text-[11px] text-gray-500">{item.category}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-gray-900">{formatUZS(item.price)}</p>
              <p className="text-[11px] text-gray-500">{item.quantity} ta</p>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="px-3 py-2 bg-green-50 border-t border-green-100 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-700">Jami: {data.totalQuantity} ta</span>
        <span className="text-sm font-bold text-green-700">{formatUZS(data.totalPrice)}</span>
      </div>
    </div>
  );
};

// --- User Details Expanded View ---
const UserDetails = ({ data }: { data: NonNullable<Notification["userData"]> }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="divide-y divide-gray-50">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex items-center justify-center size-9 rounded-full bg-blue-100 shrink-0">
            <User className="size-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{data.name}</p>
            <p className="text-[11px] text-gray-500 capitalize">{data.role === "admin" ? "Administrator" : "Foydalanuvchi"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Mail className="size-3.5 text-gray-400 shrink-0" />
          <span className="text-xs text-gray-700">{data.email || "Email ko'rsatilmagan"}</span>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Phone className="size-3.5 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-700">{data.phone || "Telefon ko'rsatilmagan"}</span>
        </div>
      </div>
    </div>
  );
};

// --- Daily Summary Expanded View ---
const SummaryDetails = ({ data }: { data: NonNullable<Notification["summaryData"]> }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Metrics grid */}
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <div className="px-3 py-3 text-center">
          <div className="flex items-center justify-center size-7 rounded-full bg-teal-100 mx-auto mb-1">
            <ShoppingBag className="size-3.5 text-teal-600" />
          </div>
          <p className="text-lg font-bold text-gray-900">{data.totalOrders}</p>
          <p className="text-[10px] text-gray-500 uppercase">Buyurtmalar</p>
        </div>
        <div className="px-3 py-3 text-center">
          <div className="flex items-center justify-center size-7 rounded-full bg-emerald-100 mx-auto mb-1">
            <TrendingUp className="size-3.5 text-emerald-600" />
          </div>
          <p className="text-sm font-bold text-emerald-600">{formatUZS(data.revenue)}</p>
          <p className="text-[10px] text-gray-500 uppercase">Daromad</p>
        </div>
        <div className="px-3 py-3 text-center">
          <div className="flex items-center justify-center size-7 rounded-full bg-amber-100 mx-auto mb-1">
            <TrendingUp className="size-3.5 text-amber-600" />
          </div>
          <p className="text-sm font-bold text-amber-600">{formatUZS(data.profit)}</p>
          <p className="text-[10px] text-gray-500 uppercase">Foyda</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="divide-y divide-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-gray-600">Yangi buyurtmalar</span>
          <span className="text-xs font-bold text-gray-900">{data.newOrders} ta</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-gray-600">Yetkazildi</span>
          <span className="text-xs font-bold text-green-600">{data.deliveredOrders} ta</span>
        </div>
        {data.cancelledOrders > 0 && (
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-gray-600">Bekor qilindi</span>
            <span className="text-xs font-bold text-red-600">{data.cancelledOrders} ta</span>
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <AlertTriangle className="size-3" /> Kam qolgan mahsulotlar
          </span>
          <span className={`text-xs font-bold ${data.lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {data.lowStockCount} ta
          </span>
        </div>
        {data.newUsers > 0 && (
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-gray-600">Yangi foydalanuvchilar</span>
            <span className="text-xs font-bold text-blue-600">{data.newUsers} ta</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPanel;
