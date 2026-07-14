// types/auth.ts
import { Timestamp } from 'firebase/firestore';

export interface ImageT {
  url: string;
  path: string;
}

// 
export interface ProductT {
  id: string;
  title: string;
  price: string;
  costPrice?: number;
  productImageUrl: ImageT[];
  category: string;
  description: string;
  quantity: number;
  stock?: number;
  time: Timestamp;
  date: Timestamp;
  storageFileId: string;
  subcategory?: string;
}

export interface CategoryI {
  id: string;
  name: string;
  description: string;
  categoryImgUrl: ImageT[];
  storageFileId: string;
  subcategory: string[]; // Added for subcategories/tags
}

export type OrderStatus = 'yangi' | 'tasdiqlangan' | 'yigʻilmoqda' | 'yetkazilmoqda' | 'yetkazildi' | 'bekor_qilindi';

// Single payment method on an order overall (summary).
// 'aralash' = mixed (cash + credit). Detailed breakdown lives in `paymentBreakdown`.
export type PaymentMethod = 'naqd' | 'nasiya' | 'aralash' | 'karta';

// One entry in a payment breakdown. Total of entries == order net total.
export interface PaymentEntry {
  method: 'naqd' | 'nasiya' | 'karta';
  amount: number;
  dueDate?: Timestamp; // only meaningful for nasiya
  note?: string;
}

// Where the order came from. POS sales should be reported separately.
export type OrderSource = 'pos' | 'web' | 'admin' | 'telegram';

// Order-level discount (header). Applied AFTER any per-line discounts.
export interface TicketDiscount {
  type: 'pct' | 'abs';
  value: number;
}

export interface Order {
  id: string;
  clientName: string;
  clientPhone: string;
  date: Timestamp;
  basketItems: ProductT[];
  totalPrice: number;
  totalQuantity: number;
  userUid: string;
  status?: OrderStatus;
  /**
   * Sequential document number (1, 2, 3 …) allocated atomically from
   * counters/orders inside the order-creation transaction. This is THE
   * number shown on the schyot-faktura and everywhere an order is
   * referenced. Optional because orders created before the counter
   * existed may lack it until the backfill migration runs.
   */
  invoiceNo?: number;
  // POS / payment fields (optional — legacy orders predate them)
  paymentMethod?: PaymentMethod | string;
  paymentBreakdown?: PaymentEntry[];
  source?: OrderSource;
  ticketDiscount?: TicketDiscount;
  netTotal?: number; // totalPrice - discounts; equals sum(paymentBreakdown.amount)
  /** Promo + ticket discount combined, in currency units. */
  discountAmount?: number;
  promoCode?: string;
  promoDiscountAmount?: number;
  /**
   * Paper delivery-sheet (yetkazish varaqasi) sequence №. Business rule:
   * a POS sale cannot be finalized without it — enforced client-side in
   * PosScreen and server-side in /api/orders/create for source 'pos'.
   */
  deliverySheetNo?: string;
}

// Promo / discount code — admins create from /admin/promo, customers redeem
// by passing `promoCode` to /api/orders/create. Validation + apply happens
// atomically inside the same Firestore transaction that creates the order
// and decrements stock — no race possible.
export interface PromoCode {
  id: string;
  /** Customer-typed code, stored UPPERCASE for case-insensitive lookup. */
  code: string;
  type: 'pct' | 'abs';
  /** pct: 1-100 (% off). abs: UZS amount off. */
  value: number;
  /** Minimum order total (gross UZS) required to apply. 0 = no min. */
  minOrderTotal: number;
  /** Total redemptions cap across all users. 0 = unlimited. */
  maxUsesTotal: number;
  /** Per-user redemption cap. Typically 1 to prevent share-and-save abuse. */
  maxUsesPerUser: number;
  /** Per-uid redemption count. Server-maintained. */
  usedBy: { [uid: string]: number };
  /** Server-maintained total redemption count. */
  totalUsed: number;
  active: boolean;
  expiresAt: Timestamp | null;
  createdAt: Timestamp;
  /** Admin-only internal note (campaign source, channel, etc.) */
  notes?: string;
}

// Nasiya (customer credit) ledger entry — created server-side when a POS sale
// includes a credit portion. One entry per credit portion of one order.
export interface NasiyaEntry {
  id: string;
  customerUid: string;
  customerName: string;
  customerPhone: string;
  orderId: string;
  amount: number;        // credited at sale
  paid: number;          // accumulated payments received
  remaining: number;     // amount - paid (server-maintained)
  dueDate?: Timestamp;
  status: 'open' | 'partial' | 'paid';
  createdAt: Timestamp;
  closedAt?: Timestamp;
  note?: string;
}

// Biznes xarajati (rasxod) — rent, salary, transport, ads… NOT cost of goods
// (that's costPrice on order lines). Feeds the P&L chain on /admin/reports:
//   A savdo aylanmasi − B tan narxi − C xarajat = D sof foyda (daromad).
// Amounts follow the WHOLE-DOLLAR policy (integer USD via toWholeMoney).
export interface Expense {
  id: string;
  title: string;
  amount: number;      // integer USD
  category: string;    // Ijara | Maosh | Transport | Kommunal | Reklama | Boshqa
  note?: string;
  date: Timestamp;     // when the expense occurred (picker on the form)
  createdAt: Timestamp;
}

export interface StockReceiptItem {
  productId: string;
  productTitle: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface StockReceipt {
  id: string;
  supplierName: string;
  date: Timestamp;
  items: StockReceiptItem[];
  totalAmount: number;
  note?: string;
}

export type StockMovementType = 'kirim' | 'sotish' | 'tuzatish' | 'qaytarish' | 'zarar';

export interface StockMovement {
  id: string;
  productId: string;
  productTitle: string;
  type: StockMovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  reference?: string;
  userId?: string;
  userName?: string;
  timestamp: Timestamp;
}