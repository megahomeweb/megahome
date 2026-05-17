import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';

/**
 * Pre-reset visibility: returns the live document count for every
 * collection the reset endpoint can touch (plus the preserved ones
 * for orientation). The reset UI calls this on mount so the operator
 * sees exactly what will be wiped before they type RESET.
 *
 * Uses Firestore's COUNT aggregation (`.count().get()`) — way cheaper
 * than reading every doc; bills as one document read per collection
 * regardless of how many documents the collection holds.
 *
 * Same auth gate as /api/admin/reset-test-data.
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

const ALL_COLLECTIONS = [
  // Transactional — cleared by both safe and factory mode
  'orders',
  'nasiya',
  'stockMovements',
  'stockReceipts',
  'idempotencyKeys',
  'telegramPendingRefs',
  // Catalog — cleared only by factory mode
  'products',
  'categories',
  // Preserved — shown for orientation, never cleared by this endpoint
  'user',
  'telegramUsers',
  'promoCodes',
] as const;

export async function GET(req: NextRequest) {
  const ok = await verifyAdmin(req);
  if (!ok) {
    return NextResponse.json(
      { error: 'Unauthorized: admin access required' },
      { status: 403 },
    );
  }

  try {
    const adminApp = getAdminApp();
    const db = adminApp.firestore();

    // Run all counts in parallel — each is a tiny aggregation read.
    // Sequential would add 11x network round-trip latency for no benefit.
    const counts: Record<string, number> = {};
    await Promise.all(
      ALL_COLLECTIONS.map(async (name) => {
        try {
          const snap = await db.collection(name).count().get();
          counts[name] = snap.data().count;
        } catch (err) {
          console.error(`[data-counts] failed counting ${name}:`, err);
          counts[name] = -1;
        }
      }),
    );

    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error('[data-counts] fatal:', error);
    return NextResponse.json(
      { error: 'Count query failed' },
      { status: 500 },
    );
  }
}
