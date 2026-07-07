/**
 * One-time migration: assign sequential invoiceNo (1, 2, 3 …) to every
 * existing order, in chronological order (date ASC), and set the
 * counters/orders doc so new sales continue the sequence.
 *
 * Idempotent: orders that already have an invoiceNo keep it; only
 * unnumbered orders are assigned, continuing from the current counter.
 *
 * Run locally with the same service-account env vars the Vercel
 * deployment uses (pull them once with `vercel env pull .env.local`):
 *
 *   node --env-file=.env.local scripts/backfill-invoice-numbers.mjs
 *
 * Pass --dry-run to print the plan without writing.
 */
import admin from 'firebase-admin';

const DRY_RUN = process.argv.includes('--dry-run');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    'Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.\n' +
      'Run: vercel env pull .env.local  — then re-run with --env-file=.env.local',
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});
const db = admin.firestore();

const COUNTER_PATH = 'counters/orders';

async function main() {
  console.log(`[backfill] project=${projectId} dryRun=${DRY_RUN}`);

  // Read every order oldest-first so numbering follows creation order.
  const snap = await db.collection('orders').orderBy('date', 'asc').get();
  console.log(`[backfill] ${snap.size} orders found`);

  const counterSnap = await db.doc(COUNTER_PATH).get();
  let current = counterSnap.exists ? Number(counterSnap.data()?.current) || 0 : 0;
  console.log(`[backfill] counter starts at ${current}`);

  const toNumber = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.invoiceNo === 'number' && data.invoiceNo > 0) {
      current = Math.max(current, data.invoiceNo);
      continue; // already numbered — keep it
    }
    toNumber.push(doc);
  }
  console.log(`[backfill] ${toNumber.length} orders need numbers (continuing after ${current})`);

  let assigned = 0;
  const PAGE = 400;
  for (let i = 0; i < toNumber.length; i += PAGE) {
    const chunk = toNumber.slice(i, i + PAGE);
    const batch = db.batch();
    for (const doc of chunk) {
      current += 1;
      const when = doc.data().date?.toDate?.()?.toISOString?.() ?? '?';
      console.log(`  № ${current}  ← orders/${doc.id}  (${when})`);
      if (!DRY_RUN) batch.update(doc.ref, { invoiceNo: current });
      assigned += 1;
    }
    if (!DRY_RUN) await batch.commit();
  }

  if (!DRY_RUN) {
    await db.doc(COUNTER_PATH).set({ current, updatedAt: new Date() }, { merge: true });
  }
  console.log(`[backfill] done: ${assigned} orders numbered, counter=${current}${DRY_RUN ? ' (dry run — nothing written)' : ''}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[backfill] failed:', err);
    process.exit(1);
  },
);
