import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';
import { INVOICE_COUNTER_PATH } from '@/lib/invoice-counter';

/**
 * "Hisobotlarni tozalash" — wipe the SALES history so every report reads
 * zero and the owner can start fresh, WITHOUT touching the catalog,
 * inventory levels, or receiving history.
 *
 * The reports page (Hisobotlar) derives every number from the `orders`
 * collection, so a scoped reset deletes exactly the sales trail:
 *   - orders            — the reports' single data source
 *   - nasiya            — customer-credit ledger rows keyed by orderId;
 *                         leaving them would orphan the Qarzdorlik card
 *   - stockMovements    — ONLY types 'sotish'/'qaytarish' (rows that
 *                         reference deleted orders). Kirim/tuzatish/zarar
 *                         rows are inventory history and stay.
 *   - idempotencyKeys   — request-dedup plumbing referencing old orders
 *   - counters/orders   — deleted, so schyot-faktura numbering restarts
 *                         at № 1 with the fresh history
 *
 * Deliberately NOT touched: products, categories, product stock (goods on
 * the shelf did not change because reports were cleared), stockReceipts
 * (kirim history), user, telegramUsers, promoCodes. The full transactional
 * wipe including stock lives at /api/admin/reset-test-data (Profil page).
 *
 * Auth: Firebase ID token, verified-email admin gate — same contract as
 * reset-test-data. Body must include confirm: "TOZALASH" (the word the
 * operator types in the UI) so a stray POST cannot wipe a live shop.
 */

export const maxDuration = 60;

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const token = authHeader.split('Bearer ')[1];
    const adminApp = getAdminApp();
    const decoded = await adminApp.auth().verifyIdToken(token);
    return isAdminEmail(decoded.email);
  } catch {
    return false;
  }
}

/** Page through a query, deleting 400 docs per batch (500 is the cap). */
async function clearByQuery(
  db: FirebaseFirestore.Firestore,
  makeQuery: () => FirebaseFirestore.Query,
): Promise<number> {
  let totalDeleted = 0;
  const PAGE = 400;
  while (true) {
    const snap = await makeQuery().limit(PAGE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < PAGE) break;
  }
  return totalDeleted;
}

export async function POST(req: NextRequest) {
  const ok = await verifyAdmin(req);
  if (!ok) {
    return NextResponse.json(
      { error: 'Unauthorized: admin access required' },
      { status: 403 },
    );
  }

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body falls through to the validation error below.
  }
  if (body.confirm !== 'TOZALASH') {
    return NextResponse.json(
      { error: 'Missing or invalid confirmation phrase (expected "TOZALASH")' },
      { status: 400 },
    );
  }

  try {
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const startedAt = Date.now();
    console.log('[clear-sales] starting');

    const cleared: Record<string, number> = {};

    // Sequential with per-step error isolation, so a failure reports
    // exactly which collection needs a retry.
    const steps: Array<{ name: string; run: () => Promise<number> }> = [
      { name: 'orders', run: () => clearByQuery(db, () => db.collection('orders')) },
      { name: 'nasiya', run: () => clearByQuery(db, () => db.collection('nasiya')) },
      {
        name: 'stockMovements(sotish/qaytarish)',
        run: () =>
          clearByQuery(db, () =>
            db.collection('stockMovements').where('type', 'in', ['sotish', 'qaytarish']),
          ),
      },
      { name: 'idempotencyKeys', run: () => clearByQuery(db, () => db.collection('idempotencyKeys')) },
    ];

    for (const step of steps) {
      try {
        const t0 = Date.now();
        cleared[step.name] = await step.run();
        console.log(`[clear-sales] cleared ${step.name}: ${cleared[step.name]} docs in ${Date.now() - t0}ms`);
      } catch (err) {
        console.error(`[clear-sales] failed clearing ${step.name}:`, err);
        cleared[step.name] = -1;
      }
    }

    // Restart schyot-faktura numbering at № 1 for the fresh history.
    let counterReset = false;
    try {
      await db.doc(INVOICE_COUNTER_PATH).delete();
      counterReset = true;
    } catch (err) {
      console.error('[clear-sales] counter reset failed:', err);
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[clear-sales] complete in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      cleared,
      counterReset,
      durationMs,
    });
  } catch (error) {
    console.error('[clear-sales] fatal:', error);
    return NextResponse.json(
      { error: 'Clear failed — check server logs' },
      { status: 500 },
    );
  }
}
