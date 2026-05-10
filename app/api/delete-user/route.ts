import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';

/**
 * Admin gate. Previously this verified admin status by reading the
 * `role` field from the caller's Firestore user doc — but that field
 * is owner-writable (firestore.rules now blocks role mutation, but
 * older rules let any user `updateDoc(myDoc, {role: 'admin'})` and
 * then call this endpoint to delete arbitrary users). We now gate on
 * the verified email claim from the Firebase ID token, matched
 * against the hardcoded admin email — there is exactly one admin
 * identity and it cannot be self-promoted.
 */
async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  try {
    const token = authHeader.split('Bearer ')[1];
    const adminApp = getAdminApp();
    const decodedToken = await adminApp.auth().verifyIdToken(token);
    return isAdminEmail(decodedToken.email);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify the requester is an authenticated admin
    const isAdmin = await verifyAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { uid } = await req.json();
    if (!uid || typeof uid !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid uid' }, { status: 400 });
    }

    const adminApp = getAdminApp();
    // Delete user from Firebase Auth
    await adminApp.auth().deleteUser(uid);
    // Delete user from Firestore
    await adminApp.firestore().collection('user').doc(uid).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Foydalanuvchini o\'chirishda xatolik yuz berdi' }, { status: 500 });
  }
}
