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
  // POS / payment fields (optional — legacy orders predate them)
  paymentMethod?: PaymentMethod | string;
  paymentBreakdown?: PaymentEntry[];
  source?: OrderSource;
  ticketDiscount?: TicketDiscount;
  netTotal?: number; // totalPrice - ticketDiscount; equals sum(paymentBreakdown.amount)
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