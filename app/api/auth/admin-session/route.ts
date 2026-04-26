import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_EMAIL, getAdminPassword } from '@/lib/admin-config';
import { resolveSessionSecret } from '@/lib/session-secret';

/**
 * Hardcoded-admin session minter. Sidesteps Firebase Admin SDK entirely.
 *
 * Why a separate endpoint from /api/auth/session?
 * The standard session endpoint verifies a Firebase ID token via the
 * Admin SDK — which requires correctly-configured FIREBASE_PRIVATE_KEY,
 * FIREBASE_CLIENT_EMAIL, and a service account whose project matches the
 * client's. When any of those are misaligned, verifyIdToken throws and
 * the caller sees "Invalid token" with no recovery path. Since there is
 * exactly one admin and it's identified by a fixed credential pair, we
 * mint the admin cookie based on the credential pair directly. No
 * Google round-trip, no service-account dependency, no project
 * mismatch failure mode.
 *
 * Security model:
 *   - The admin password is a server-side secret (env-overridable).
 *   - Only this endpoint can produce a cookie with role='admin'.
 *   - The cookie is HMAC-SHA-256 signed with SESSION_SECRET, so it can't
 *     be forged client-side.
 *   - Middleware already verifies HMAC + role on every /admin/* request.
 */

async function signPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(resolveSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      email?: string;
      password?: string;
      uid?: string;
    };
    const { email, password, uid } = body;

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email va parol majburiy' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const expectedPassword = getAdminPassword();

    // Constant-time-ish credential check. The single comparison is
    // adequate here (timing oracle on a fixed-length string isn't
    // exploitable in practice for this single-credential gate), but we
    // intentionally compare both fields rather than short-circuiting on
    // email mismatch so the response time is closer to constant.
    const emailOk = normalizedEmail === ADMIN_EMAIL;
    const passwordOk = password === expectedPassword;
    if (!emailOk || !passwordOk) {
      return NextResponse.json(
        { error: 'Email yoki parol xato' },
        { status: 401 }
      );
    }

    // The `uid` field carries the Firebase Auth UID when the client has
    // already authenticated with Firebase. It's used downstream so
    // Firestore reads (which require an auth context) work for the same
    // identity. If absent, fall back to a placeholder — middleware only
    // gates on `role`, not `uid`.
    const adminUid = (typeof uid === 'string' && uid.length > 0) ? uid : 'admin-hardcoded';
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

    const payload = JSON.stringify({
      role: 'admin',
      uid: adminUid,
      email: ADMIN_EMAIL,
      exp,
    });
    const signature = await signPayload(payload);
    const sessionValue = `${btoa(payload)}.${signature}`;

    const response = NextResponse.json({ ok: true, role: 'admin' });
    response.cookies.set('__session', sessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Admin session error:', error);
    return NextResponse.json({ error: 'Sessiya yaratilmadi' }, { status: 500 });
  }
}
