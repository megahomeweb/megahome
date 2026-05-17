import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';

/**
 * Reset every TRANSACTIONAL collection back to empty so the owner can
 * demo the POS to a shop as if it were freshly deployed: reports/charts
 * read zero, ombor history is clean, no leftover nasiya balances.
 *
 * Two modes:
 *   - "safe" (default): clears transactional data; preserves catalog
 *     (products + categories) — only zeros products.stock so kirim flow
 *     can be tested from an empty-shelf state.
 *   - "factory": also wipes products + categories. For the "I deleted
 *     my catalog by accident and the dashboard still shows old revenue
 *     from snapshot basketItems — give me a TRUE zero state" case.
 *
 * SURVIVES even a factory reset:
 *   - `user` (every account, including admin) — owner explicitly asked
 *     to preserve customer logins
 *   - `telegramUsers`, `promoCodes` — owner-directive ("don't mind
 *     telegram for now")
 *
 * Auth: Firebase ID token in `Authorization: Bearer …`, gated on the
 * verified email claim matching the hardcoded admin email. Body must
 * include `confirm: "RESET"` (case-sensitive) so a random POST to this
 * endpoint cannot accidentally wipe a live shop. Factory mode also
 * requires `mode: "factory"` explicitly — never default to it.
 *
 * Vercel maxDuration is set to 60s; the hobby tier default is 10s
 * which is too short if there are thousands of stockMovements rows
 * accumulated from past testing.
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

// Transactional collections — always cleared.
const SAFE_COLLECTIONS = [
  'orders',
  'nasiya',
  'stockMovements',
  'stockReceipts',
  'idempotencyKeys',
  'telegramPendingRefs',
] as const;

// Catalog collections — only cleared in factory mode.
const FACTORY_EXTRA_COLLECTIONS = ['products', 'categories'] as const;

/**
 * Batch-delete every document in a collection. Firestore caps a single
 * batch at 500 ops, so we page through in chunks. Returns the count so
 * the operator can verify per-collection what was wiped.
 */
async function clearCollection(
  db: FirebaseFirestore.Firestore,
  collectionPath: string,
): Promise<number> {
  let totalDeleted = 0;
  const PAGE = 400;
  while (true) {
    const snap = await db.collection(collectionPath).limit(PAGE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < PAGE) break;
  }
  return totalDeleted;
}

/**
 * Set every product's stock to 0. Touches only the `stock` field so
 * everything else (title, price, costPrice, images, category) survives
 * exactly as it was — the catalog is preserved, only inventory is reset.
 *
 * Returns the count, OR 0 if there are no products to update (factory
 * mode will have already deleted them before calling this).
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
  const ok = await verifyAdmin(req);
  if (!ok) {
    return NextResponse.json(
      { error: 'Unauthorized: admin access required' },
      { status: 403 },
    );
  }

  let body: { confirm?: string; mode?: 'safe' | 'factory' } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body falls through to the validation error below.
  }
  if (body.confirm !== 'RESET') {
    return NextResponse.json(
      { error: 'Missing or invalid confirmation phrase (expected "RESET")' },
      { status: 400 },
    );
  }
  // Factory mode must be opt-in by explicit string match. Anything else
  // (undefined, "safe", typo) routes to the safe path. Defense against
  // a client sending `mode: true` and wiping the catalog by accident.
  const mode: 'safe' | 'factory' = body.mode === 'factory' ? 'factory' : 'safe';

  try {
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const startedAt = Date.now();
    console.log(`[reset] starting mode=${mode}`);

    const cleared: Record<string, number> = {};
    const collectionsToClear: readonly string[] =
      mode === 'factory'
        ? [...SAFE_COLLECTIONS, ...FACTORY_EXTRA_COLLECTIONS]
        : SAFE_COLLECTIONS;

    // Sequential — if one step throws we want to know which collection
    // failed so the operator can retry only that one if needed.
    for (const name of collectionsToClear) {
      try {
        const t0 = Date.now();
        cleared[name] = await clearCollection(db, name);
        console.log(`[reset] cleared ${name}: ${cleared[name]} docs in ${Date.now() - t0}ms`);
      } catch (err) {
        console.error(`[reset] failed clearing ${name}:`, err);
        cleared[name] = -1;
      }
    }

    // Stock zeroing only runs in safe mode — in factory mode the
    // products collection no longer exists, so there's nothing to update.
    let productsZeroed = 0;
    if (mode === 'safe') {
      try {
        const t0 = Date.now();
        productsZeroed = await zeroProductStock(db);
        console.log(`[reset] zeroed stock on ${productsZeroed} products in ${Date.now() - t0}ms`);
      } catch (err) {
        console.error('[reset] failed zeroing product stock:', err);
        productsZeroed = -1;
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[reset] complete mode=${mode} in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      mode,
      cleared,
      productsZeroed,
      durationMs,
    });
  } catch (error) {
    console.error('[reset] fatal:', error);
    return NextResponse.json(
      { error: 'Reset failed — check server logs' },
      { status: 500 },
    );
  }
}
