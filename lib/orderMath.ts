/**
 * Single source of truth for order revenue / cost / profit / completion.
 *
 * Why this exists:
 *   The dashboard, reports page, daily summary, customer stats, and three
 *   charts each used to compute these inline — and silently disagreed:
 *     • Some used `totalPrice` (gross), some implicitly should use `netTotal`
 *       (after promo + ticket discount). Discounted sales were over-reporting
 *       both revenue AND profit by the discount amount.
 *     • POS sales sit at `status: 'yangi'` after creation (the API route
 *       defaulted every order to 'yangi') — yet a POS sale is FINAL the
 *       moment the customer pays cash and walks out. Filtering on
 *       `status === 'yetkazildi'` made today's POS revenue invisible.
 *
 *   Centralising the math here means a future change (e.g. excluding nasiya
 *   portions from cash revenue, or splitting refund accounting) edits one
 *   file, not ten.
 */
import type { Order } from './types';

/**
 * Net amount the customer actually owed/paid for this order, after promo
 * and ticket discounts. Falls back to `totalPrice` for legacy orders that
 * predate the netTotal field.
 */
export function orderRevenue(o: Pick<Order, 'totalPrice' | 'netTotal'>): number {
  if (typeof o.netTotal === 'number' && Number.isFinite(o.netTotal) && o.netTotal >= 0) {
    return o.netTotal;
  }
  return o.totalPrice || 0;
}

/** Cost of goods sold (sum of costPrice × quantity over the basket). */
export function orderCost(o: Pick<Order, 'basketItems'>): number {
  return (o.basketItems || []).reduce(
    (s, item) => s + (item.costPrice || 0) * item.quantity,
    0,
  );
}

/** Net profit on this single order. */
export function orderProfit(o: Pick<Order, 'totalPrice' | 'netTotal' | 'basketItems'>): number {
  return orderRevenue(o) - orderCost(o);
}

/**
 * Whether this order should be counted as a "completed sale" for
 * dashboard / reports / charts.
 *
 *   • status='yetkazildi'                — delivered web/telegram order
 *   • source='pos' AND not cancelled     — over-the-counter cash/card sale
 *
 * 'bekor_qilindi' is always excluded; pending statuses (yangi, tasdiqlangan,
 * yigʻilmoqda, yetkazilmoqda) on non-POS orders are excluded — money hasn't
 * arrived yet.
 */
export function isCompletedSale(o: Pick<Order, 'status' | 'source'>): boolean {
  if (o.status === 'bekor_qilindi') return false;
  if (o.status === 'yetkazildi') return true;
  if (o.source === 'pos') return true;
  return false;
}

/**
 * Outstanding nasiya (customer credit) on this order — what the customer
 * still owes. Returns 0 if no nasiya portion. Useful for the "Qarzdorlik"
 * card on the dashboard.
 *
 * Note: this reads from the order's snapshot of paymentBreakdown. The
 * authoritative remaining-balance lives in the `nasiya` collection
 * (server-maintained as payments come in). Use this only as a quick
 * UI hint; for true AR aging, query nasiya directly.
 */
export function orderNasiyaAmount(o: Pick<Order, 'paymentBreakdown'>): number {
  if (!o.paymentBreakdown) return 0;
  return o.paymentBreakdown
    .filter((e) => e.method === 'nasiya')
    .reduce((s, e) => s + (e.amount || 0), 0);
}

/**
 * Aggregate a list of orders into the canonical financial summary used
 * across the admin UI. Single pass.
 */
export interface OrderTotals {
  revenue: number;
  cost: number;
  profit: number;
  margin: number; // 0–100
  count: number;
  itemsSold: number;
  outstandingNasiya: number;
}

export function summarizeOrders(orders: readonly Order[]): OrderTotals {
  let revenue = 0;
  let cost = 0;
  let count = 0;
  let itemsSold = 0;
  let outstandingNasiya = 0;
  for (const o of orders) {
    if (!isCompletedSale(o)) continue;
    count++;
    revenue += orderRevenue(o);
    cost += orderCost(o);
    itemsSold += o.totalQuantity || 0;
    outstandingNasiya += orderNasiyaAmount(o);
  }
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, cost, profit, margin, count, itemsSold, outstandingNasiya };
}
