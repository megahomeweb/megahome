/**
 * Single source of truth for the human-facing order/invoice number.
 *
 * Orders carry a sequential `invoiceNo` (1, 2, 3 …) allocated from the
 * counters/orders doc inside the creation transaction. Legacy orders
 * created before the counter existed fall back to the last-8 slice of
 * the Firestore id — the same string historically shown in the invoices
 * list and Telegram messages, so old references stay resolvable.
 *
 * Every surface (invoice document, invoices list, POS success screen,
 * Cheklar history, customer Telegram DMs, share messages) must format
 * through here so one order never shows two different numbers again.
 */
export function formatOrderNo(o: { invoiceNo?: number; id?: string }): string {
  if (typeof o.invoiceNo === 'number' && Number.isFinite(o.invoiceNo) && o.invoiceNo > 0) {
    return String(o.invoiceNo);
  }
  return (o.id || '').slice(-8).toUpperCase();
}

/** "№ 12" — the display form used on documents and receipts. */
export function displayOrderNo(o: { invoiceNo?: number; id?: string }): string {
  return `№ ${formatOrderNo(o)}`;
}
