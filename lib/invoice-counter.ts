import type { firestore } from 'firebase-admin';

/**
 * Sequential order/invoice numbering (1, 2, 3 …).
 *
 * The counter lives at counters/orders {current: <last issued number>}
 * and is read + advanced INSIDE the same Firestore transaction that
 * creates the order, so two simultaneous sales can never draw the same
 * number (the transaction retries on contention). The Admin SDK bypasses
 * security rules; the `counters` collection has no client rules on
 * purpose — it is server-owned.
 *
 * Firestore transactions require all reads before any write, so the
 * helper is split in two: call readNextInvoiceNo() in the read phase,
 * commitInvoiceNo() alongside the other writes.
 *
 * Numbers restart from 1 when the counter doc is deleted — the
 * clear-sales-history endpoint does exactly that so a fresh start also
 * restarts the schyot-faktura sequence.
 */
export const INVOICE_COUNTER_PATH = 'counters/orders';

export async function readNextInvoiceNo(
  db: firestore.Firestore,
  tx: firestore.Transaction,
): Promise<number> {
  const snap = await tx.get(db.doc(INVOICE_COUNTER_PATH));
  const current = snap.exists ? Number(snap.data()?.current) || 0 : 0;
  return current + 1;
}

export function commitInvoiceNo(
  db: firestore.Firestore,
  tx: firestore.Transaction,
  invoiceNo: number,
): void {
  tx.set(
    db.doc(INVOICE_COUNTER_PATH),
    { current: invoiceNo, updatedAt: new Date() },
    { merge: true },
  );
}
