"use client"
import { useEffect, useRef } from 'react';
import { useOrderStore } from '@/store/useOrderStore';
import useProductStore from '@/store/useProductStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { telegramNotify } from '@/lib/telegram/notify-client';
import { isCompletedSale, summarizeOrders } from '@/lib/orderMath';

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DailySummaryGenerator = () => {
  const { orders } = useOrderStore();
  const { products } = useProductStore();
  const { _lastSummaryDate, addDailySummary } = useNotificationStore();
  const generatedRef = useRef(false);

  useEffect(() => {
    const today = getTodayString();
    if (_lastSummaryDate === today || generatedRef.current) return;
    if (orders.length === 0 && products.length === 0) return;

    generatedRef.current = true;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startMs = todayStart.getTime();

    const todayOrders = orders.filter((o) => {
      if (!o.date?.seconds) return false;
      return o.date.seconds * 1000 >= startMs;
    });

    // Same definition the dashboard / charts / reports use:
    // a sale "completes" when it's delivered OR comes from POS.
    const completed = todayOrders.filter(isCompletedSale);
    const cancelled = todayOrders.filter((o) => o.status === 'bekor_qilindi');
    const newOrd = todayOrders.filter((o) => o.status === 'yangi');

    const totals = summarizeOrders(todayOrders);
    const revenue = totals.revenue;
    const profit = totals.profit;

    const lowStockCount = products.filter(
      (p) => p.stock !== undefined && p.stock !== null && (p.stock as number) <= 5
    ).length;

    const notifs = useNotificationStore.getState().notifications;
    const newUsers = notifs.filter(
      (n) => n.type === 'new_user' && n.timestamp >= startMs
    ).length;

    const summaryData = {
      totalOrders: todayOrders.length,
      newOrders: newOrd.length,
      deliveredOrders: completed.length,
      cancelledOrders: cancelled.length,
      revenue,
      profit,
      lowStockCount,
      newUsers,
      date: today,
    };

    addDailySummary(summaryData);

    // Send daily summary to admin via Telegram
    telegramNotify('daily_summary', summaryData);

    // Alert admin about low stock products
    if (lowStockCount > 0) {
      const lowStockProducts = products
        .filter((p) => p.stock !== undefined && (p.stock as number) <= 5)
        .map((p) => ({ title: p.title, stock: p.stock as number }));
      telegramNotify('low_stock', { products: lowStockProducts });
    }
  }, [orders, products, _lastSummaryDate, addDailySummary]);

  return null;
};

export default DailySummaryGenerator;
