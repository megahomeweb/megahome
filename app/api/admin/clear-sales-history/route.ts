import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';
import { INVOICE_COUNTER_PATH } from '@/lib/invoice-counter';

/**
 * "Hisobotlarni tozalash" — wipe SALES history so reports read zero,
 * WITHOUT touching the catalog, inventory levels, or receiving history.
 *
 * Two modes, chosen by the request body:
 *
 * FULL (no fromMs/toMs) — the original behavior:
 *   - orders, nasiya, sotish/qaytarish stockMovements, idempotencyKeys
 *   - counters/orders deleted → schyot-faktura numbering restarts at № 1
 *
 * RANGE (fromMs + toMs, ms epoch, [from, to) local-day bounds computed by
 * the UI) — "shu davrni tozalash": deletes ONLY orders whose `date` falls
 * in the window, then cascades by the collected order ids so nothing is
 * orphaned:
 *   - nasiya            — where orderId in deleted ids
 *   - stockMovements    — where reference in deleted ids (sale audit rows;
 *                         kirim/tuzatish rows never carry an order ref)
 *   - idempotencyKeys   — where orderId in deleted ids (keys are stamped
 *                         with the resulting orderId post-commit)
 *   - counters/orders   — NEVER touched: surviving orders keep their №s,
 *                         so restarting numbering would mint duplicates.
 *
 * Deliberately NOT touched in either mode: products, categories, product
 * stock, stockReceipts (kirim), user, telegramUsers, promoCodes. The full
 * transactional wipe including stock lives at /api/admin/reset-test-data.
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

/** Page through a query, deleting 400 docs per batch (500 is the cap).
 *  `collectIds` receives every deleted doc id (range mode's cascade). */
async function clearByQuery(
  db: FirebaseFirestore.Firestore,
  makeQuery: () => FirebaseFirestore.Query,
  collectIds?: (id: string) => void,
): Promise<number> {
  let totalDeleted = 0;
  const PAGE = 400;
  while (true) {
    const snap = await makeQuery().limit(PAGE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => {
      collectIds?.(d.id);
      batch.delete(d.ref);
    });
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < PAGE) break;
  }
  return totalDeleted;
}

/** Delete docs whose `field` matches any of `ids` (chunked ≤30 per 'in'). */
async function clearByIdRefs(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  field: string,
  ids: string[],
): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    total += await clearByQuery(db, () =>
      db.collection(collectionName).where(field, 'in', chunk),
    );
  }
  return total;
}

export async function POST(req: NextRequest) {
  const ok = await verifyAdmin(req);
  if (!ok) {
    return NextResponse.json(
      { error: 'Unauthorized: admin access required' },
      { status: 403 },
    );
  }

  let body: { confirm?: string; fromMs?: number; toMs?: number } = {};
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

  // Range mode iff both bounds arrive as finite ms epochs.
  const hasRange = body.fromMs !== undefined || body.toMs !== undefined;
  const fromMs = Number(body.fromMs);
  const toMs = Number(body.toMs);
  if (hasRange && (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs)) {
    return NextResponse.json(
      { error: 'Invalid range: fromMs and toMs must be ms epochs with fromMs < toMs' },
      { status: 400 },
    );
  }

  try {
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const startedAt = Date.now();
    console.log(`[clear-sales] starting (${hasRange ? `range ${new Date(fromMs).toISOString()}..${new Date(toMs).toISOString()}` : 'ALL'})`);

    const cleared: Record<string, number> = {};

    // Sequential with per-step error isolation, so a failure reports
    // exactly which collection needs a retry.
    let steps: Array<{ name: string; run: () => Promise<number> }>;

    if (hasRange) {
      // Delete the period's orders first, collecting their ids, then cascade
      // the linked rows by id — kirim/tuzatish audit rows and other periods'
      // sales are untouched.
      const deletedOrderIds: string[] = [];
      steps = [
        {
          name: 'orders',
          run: () =>
            clearByQuery(
              db,
              () =>
                db
                  .collection('orders')
                  .where('date', '>=', Timestamp.fromMillis(fromMs))
                  .where('date', '<', Timestamp.fromMillis(toMs)),
              (id) => deletedOrderIds.push(id),
            ),
        },
        { name: 'nasiya', run: () => clearByIdRefs(db, 'nasiya', 'orderId', deletedOrderIds) },
        {
          name: 'stockMovements(sotish/qaytarish)',
          run: () => clearByIdRefs(db, 'stockMovements', 'reference', deletedOrderIds),
        },
        {
          name: 'idempotencyKeys',
          run: () => clearByIdRefs(db, 'idempotencyKeys', 'orderId', deletedOrderIds),
        },
      ];
    } else {
      steps = [
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
    }

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

    // Restart schyot-faktura numbering at № 1 — FULL wipe only. After a
    // range wipe the surviving orders keep their №s; resetting the counter
    // would hand out duplicates.
    let counterReset = false;
    if (!hasRange) {
      try {
        await db.doc(INVOICE_COUNTER_PATH).delete();
        counterReset = true;
      } catch (err) {
        console.error('[clear-sales] counter reset failed:', err);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[clear-sales] complete in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      mode: hasRange ? 'range' : 'all',
      fromMs: hasRange ? fromMs : undefined,
      toMs: hasRange ? toMs : undefined,
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
