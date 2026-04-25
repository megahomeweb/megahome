import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';

/**
 * Admin-only customer creation (POS / admin panel).
 *
 * Why a server route?
 *   - POS-created customers have NO Firebase Auth account; they're just
 *     leads stored in the `user` collection so future sales can attach
 *     to them by uid.
 *   - The default Firestore rule for `user` only lets a logged-in user
 *     create their own profile (isOwner). Admins writing on someone
 *     else's behalf must go through Admin SDK (which bypasses rules)
 *     and prove they're admin first.
 *   - This mirrors the pattern of /api/orders/create and /api/delete-user.
 *
 * Request:
 *   Authorization: Bearer <Firebase ID token of the logged-in admin>
 *   Body: { name, phone?, customerType: 'jismoniy' | 'yuridik' }
 *
 * Response (200): { ok: true, uid, user }
 *   On error: { error, status }
 */

interface CreateCustomerBody {
  name: string;
  phone?: string;
  customerType: 'jismoniy' | 'yuridik';
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminApp = getAdminApp();
    let callerUid: string;
    try {
      const token = authHeader.split('Bearer ')[1];
      const decoded = await adminApp.auth().verifyIdToken(token);
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const db = adminApp.firestore();

    // Verify caller is admin (source of truth: Firestore role)
    const callerDoc = await db.collection('user').doc(callerUid).get();
    const callerRole = callerDoc.exists ? callerDoc.data()?.role : null;
    if (callerRole !== 'admin' && callerRole !== 'manager') {
      return NextResponse.json({ error: 'Faqat admin/menejer mijoz qoʻsha oladi' }, { status: 403 });
    }

    // ── Parse + validate body ────────────────────────────
    let body: CreateCustomerBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const name = String(body.name ?? '').trim();
    if (name.length < 1) {
      return NextResponse.json({ error: 'Mijoz ismini kiriting' }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'Ism juda uzun' }, { status: 400 });
    }

    const customerType = body.customerType === 'yuridik' ? 'yuridik' : 'jismoniy';

    let phone = '';
    if (body.phone) {
      const digits = String(body.phone).replace(/\D/g, '');
      if (digits.length > 0) {
        // Normalize to +998XXXXXXXXX (9 digits after country code)
        const tail = digits.startsWith('998') ? digits.slice(3) : digits;
        phone = '+998' + tail.slice(0, 12);
      }
    }

    // ── Optional: dedupe by phone ────────────────────────
    if (phone) {
      const existing = await db.collection('user').where('phone', '==', phone).limit(1).get();
      if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data() ?? {};
        return NextResponse.json(
          {
            ok: true,
            uid: doc.id,
            duplicate: true,
            user: {
              uid: doc.id,
              name: String(data.name ?? ''),
              phone: String(data.phone ?? ''),
              email: data.email ?? null,
              role: String(data.role ?? 'user'),
              time: data.time?.toMillis?.() ?? Date.now(),
              date: String(data.date ?? new Date().toLocaleDateString('uz-UZ')),
            },
          },
          { status: 200 },
        );
      }
    }

    // ── Write ────────────────────────────────────────────
    const now = new Date();
    const dateLabel = now.toLocaleDateString('uz-UZ');
    const docRef = await db.collection('user').add({
      name,
      phone,
      email: null,
      role: 'user',
      time: now,
      date: dateLabel,
      customerType,
      createdViaPos: true,
      createdByUid: callerUid,
    });

    return NextResponse.json({
      ok: true,
      uid: docRef.id,
      user: {
        uid: docRef.id,
        name,
        phone,
        email: null,
        role: 'user',
        time: now.getTime(),
        date: dateLabel,
      },
    });
  } catch (err) {
    console.error('Customer create route error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
