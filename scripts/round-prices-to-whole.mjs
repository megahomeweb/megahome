/**
 * One-time migration (owner-directed): normalize every product's `price`
 * and `costPrice` to WHOLE dollars (half-up), per the shop's fixed-price
 * rule — "34, 45, no .57".
 *
 * The fractional prices came in via the supplier Excel import (52.58$)
 * and are what made the POS silently flag untouched lines as overrides
 * and eat the margin. After this migration the catalog is integer-only,
 * and every write boundary in the app keeps it that way.
 *
 * Idempotent: rounding an integer is a no-op; already-clean products are
 * skipped entirely.
 *
 *   node --env-file=.env.local scripts/round-prices-to-whole.mjs [--dry-run]
 */
import admin from 'firebase-admin';

const DRY_RUN = process.argv.includes('--dry-run');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_* env vars. Run: vercel env pull .env.local');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});
const db = admin.firestore();

const round = (n) => Math.round(Number(n) || 0);

async function main() {
  console.log(`[round-prices] project=${projectId} dryRun=${DRY_RUN}`);
  const snap = await db.collection('products').get();
  console.log(`[round-prices] ${snap.size} products found`);

  let changed = 0;
  const batch = db.batch();
  for (const doc of snap.docs) {
    const data = doc.data();
    const oldPrice = Number(data.price);
    const oldCost = typeof data.costPrice === 'number' ? data.costPrice : 0;
    const newPrice = round(oldPrice);
    const newCost = round(oldCost);
    const priceDirty = Number.isFinite(oldPrice) && oldPrice !== newPrice;
    const costDirty = oldCost !== newCost;
    if (!priceDirty && !costDirty) continue;
    changed += 1;
    console.log(
      `  ${data.title?.slice(0, 48) ?? doc.id}  price ${oldPrice} → ${newPrice}` +
        (costDirty ? `, cost ${oldCost} → ${newCost}` : ''),
    );
    if (!DRY_RUN) {
      batch.update(doc.ref, {
        ...(priceDirty ? { price: String(newPrice) } : {}),
        ...(costDirty ? { costPrice: newCost } : {}),
      });
    }
  }

  if (!DRY_RUN && changed > 0) await batch.commit();
  console.log(`[round-prices] done: ${changed} products normalized${DRY_RUN ? ' (dry run — nothing written)' : ''}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[round-prices] failed:', err);
    process.exit(1);
  },
);
