import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';

/**
 * Reset every TRANSACTIONAL collection back to empty so the owner can
 * demo the POS to a shop as if it were freshly deployed: reports/charts
 * read zero, ombor history is clean, no leftover nasiya balances.
 *
 * SURVIVES the reset:
 *   - `categories`   (catalog masters)
 *   - `products`     (catalog — but `stock` field is zeroed)
 *   - `user`         (every account, including admin)
 *   - `telegramUsers`, `promoCodes`  (left untouched per owner directive)
 *
 * GETS CLEARED:
 *   - `orders`               (sales / web / admin / telegram)
 *   - `nasiya`               (credit ledger)
 *   - `stockMovements`       (ombor audit trail)
 *   - `stockReceipts`        (kirim history)
 *   - `idempotencyKeys`      (order-create dedup state)
 *   - `telegramPendingRefs`  (Telegram checkout transient state)
 *
 * PRODUCTS: every product's `stock` is set to 0 so the kirim flow can be
 * tested from a true empty-shelf state. costPrice is left intact — owner
 * can edit per product if they want, and there's no reporting impact when
 * no sales exist.
 *
 * Auth: Firebase ID token in `Authorization: Bearer …`, gated on the
 * verified email claim matching the hardcoded admin email. Body must
 * include `confirm: "RESET"` so a random POST to this endpoint (e.g.
 * from a misconfigured script) cannot accidentally wipe a live shop.
 */

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

const COLLECTIONS_TO_CLEAR = [
  'orders',
  'nasiya',
  'stockMovements',
  'stockReceipts',
  'idempotencyKeys',
  'telegramPendingRefs',
] as const;

/**
 * Batch-delete every document in a collection. Firestore caps a single
 * batch at 500 ops, so we page through in chunks. BulkWriter would be
 * fewer lines but it doesn't return per-collection counts cleanly, and
 * the operator wants to see exactly how many docs were wiped per
 * collection to verify the reset worked.
 */
async function clearCollection(
  db: FirebaseFirestore.Firestore,
  collectionPath: string,
): Promise<number> {
  let totalDeleted = 0;
  const PAGE = 400; // stay safely under the 500-op batch limit
  // Loop because a single .get() can return tens of thousands of docs and
  // batches must be <= 500 ops. Each iteration: page the next 400 doc
  // refs (id-only) and commit them in one batch.
  while (true) {
    const snap = await db.collection(collectionPath).limit(PAGE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    // If the page was smaller than the limit, we've drained the collection.
    if (snap.size < PAGE) break;
  }
  return totalDeleted;
}

/**
 * Set every product's stock to 0. Paged for the same reason as
 * clearCollection — a catalog of thousands of SKUs can't be updated in
 * one batch. We touch only the `stock` field so the catalog (title,
 * price, costPrice, images, category) is preserved exactly as-is.
 */
async function zeroProductStock(
  db: FirebaseFirestore.Firestore,
): Promise<number> {
  let updated = 0;
  const PAGE = 400;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let q: FirebaseFirestore.Query = db
      .collection('products')
      .orderBy('__name__')
      .limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { stock: 0 }));
    await batch.commit();
    updated += snap.size;
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return updated;
}

export async function POST(req: NextRequest) {
  // 1. Auth gate
  const ok = await verifyAdmin(req);
  if (!ok) {
    return NextResponse.json(
      { error: 'Unauthorized: admin access required' },
      { status: 403 },
    );
  }

  // 2. Confirmation phrase — defeats accidental triggers from a stray fetch
  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine to surface a clearer error below
  }
  if (body.confirm !== 'RESET') {
    return NextResponse.json(
      { error: 'Missing or invalid confirmation phrase (expected "RESET")' },
      { status: 400 },
    );
  }

  // 3. Execute reset
  try {
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const startedAt = Date.now();

    const cleared: Record<string, number> = {};
    // Sequential — if one collection throws partway, the operator gets a
    // partial report and can re-run. Parallel would hide which step failed.
    for (const name of COLLECTIONS_TO_CLEAR) {
      try {
        cleared[name] = await clearCollection(db, name);
      } catch (err) {
        console.error(`[reset] failed clearing ${name}:`, err);
        cleared[name] = -1; // sentinel — UI shows "xato" for this row
      }
    }

    let productsZeroed = 0;
    try {
      productsZeroed = await zeroProductStock(db);
    } catch (err) {
      console.error('[reset] failed zeroing product stock:', err);
      productsZeroed = -1;
    }

    return NextResponse.json({
      success: true,
      cleared,
      productsZeroed,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[reset] fatal:', error);
    return NextResponse.json(
      { error: 'Reset failed — check server logs' },
      { status: 500 },
    );
  }
}
