import { formatUZS } from './formatPrice';
import { formatOrderNo } from './orderNumber';

interface ShareableOrderItem {
  title: string;
  quantity: number;
  price: string | number;
}

interface ShareableOrder {
  id: string;
  invoiceNo?: number;
  clientName: string;
  clientPhone?: string;
  totalPrice: number;
  totalQuantity: number;
  basketItems: ShareableOrderItem[];
  status?: string;
}

/**
 * Turn an order into a clean, copy-pastable Uzbek summary.
 * Used for Telegram/WhatsApp share buttons on the admin orders page —
 * one tap replaces typing out the whole order in a chat.
 */
export function formatOrderForShare(order: ShareableOrder): string {
  const header = [
    `🧾 Buyurtma № ${formatOrderNo(order)}`,
    `👤 ${order.clientName}`,
    order.clientPhone ? `📞 ${order.clientPhone}` : '',
  ].filter(Boolean).join('\n');

  const items = order.basketItems
    .slice(0, 20)
    .map((it, i) => `${i + 1}. ${it.title} — ${it.quantity} × ${formatUZS(it.price)}`)
    .join('\n');

  const more = order.basketItems.length > 20
    ? `\n… va yana ${order.basketItems.length - 20} ta mahsulot`
    : '';

  const totals = [
    `📦 Jami: ${order.totalQuantity} ta`,
    `💰 Summa: ${formatUZS(order.totalPrice)}`,
  ].join('\n');

  return `${header}\n\n${items}${more}\n\n${totals}`;
}

function openShareLink(url: string) {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Open Telegram with the order text pre-filled in the share picker. */
export function shareOrderToTelegram(order: ShareableOrder) {
  const text = encodeURIComponent(formatOrderForShare(order));
  openShareLink(`https://t.me/share/url?url=${text}&text=${text}`);
}

/** Open WhatsApp with the order text pre-filled. */
export function shareOrderToWhatsApp(order: ShareableOrder) {
  const text = encodeURIComponent(formatOrderForShare(order));
  const phone = (order.clientPhone || '').replace(/\D/g, '');
  const base = phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;
  openShareLink(base);
}

/** Copy the share text to clipboard (fallback when native share unavailable). */
export async function copyOrderText(order: ShareableOrder): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(formatOrderForShare(order));
    return true;
  } catch {
    return false;
  }
}

/** Best effort: use native Web Share API where available, fall back to WhatsApp. */
export async function shareOrderNative(order: ShareableOrder): Promise<void> {
  const text = formatOrderForShare(order);
  const nav = typeof navigator === 'undefined' ? null : navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav?.share) {
    try {
      await nav.share({ title: `Buyurtma № ${formatOrderNo(order)}`, text });
      return;
    } catch {
      // user cancelled or share failed — fall through to WhatsApp
    }
  }
  shareOrderToWhatsApp(order);
}
