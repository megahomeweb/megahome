import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';
import { randomInt } from 'crypto';

/**
 * Admin-only password reset for customer support.
 *
 * Firebase Auth stores passwords as one-way hashes — the ORIGINAL
 * password is unrecoverable by design, for anyone. When a customer calls
 * saying they forgot theirs, the admin resets it to a fresh generated
 * temporary password and reads it to them over the phone. The password
 * is returned to the admin's browser exactly once and is never logged
 * or stored anywhere in plaintext.
 *
 * Admin gate matches /api/delete-user: verified Firebase ID token email
 * claim against the single hardcoded admin identity.
 */
async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.split('Bearer ')[1];
    const adminApp = getAdminApp();
    const decodedToken = await adminApp.auth().verifyIdToken(token);
    return isAdminEmail(decodedToken.email) ? (decodedToken.email ?? null) : null;
  } catch {
    return null;
  }
}

// Dictation-friendly alphabet: no 0/O, 1/l/I lookalikes — the admin
// reads this aloud over the phone, so every character must be
// unambiguous when spoken and typed on a phone keyboard.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH = 8;

function generateTempPassword(): string {
  let out = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await verifyAdmin(req);
    if (!adminEmail) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { uid } = await req.json();
    if (!uid || typeof uid !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid uid' }, { status: 400 });
    }

    const adminApp = getAdminApp();
    const password = generateTempPassword();

    try {
      // Also revokes the customer's existing refresh tokens, so any
      // session opened with the old (forgotten) password dies with it.
      await adminApp.auth().updateUser(uid, { password });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found') {
        // POS-created customer docs and telegram-whitelist admin docs
        // exist in Firestore without a Firebase Auth account.
        return NextResponse.json({ error: "Bu mijozda kirish hisobi yo'q" }, { status: 404 });
      }
      throw err;
    }

    // Audit trail on the profile doc — who reset and when. The password
    // itself is deliberately NOT written anywhere.
    await adminApp
      .firestore()
      .collection('user')
      .doc(uid)
      .set({ passwordResetAt: new Date(), passwordResetBy: adminEmail }, { merge: true });

    return NextResponse.json({ success: true, password });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Parolni tiklashda xatolik yuz berdi' }, { status: 500 });
  }
}
