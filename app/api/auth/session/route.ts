import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { resolveSessionSecret } from '@/lib/session-secret';

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
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const adminApp = getAdminApp();
    const decoded = await adminApp.auth().verifyIdToken(idToken);

    // Read role from Firestore (source of truth)
    const userDoc = await adminApp.firestore().collection('user').doc(decoded.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const role = userDoc.data()?.role || 'user';
    const uid = decoded.uid;
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

    const payload = JSON.stringify({ role, uid, exp });
    const signature = await signPayload(payload);
    const sessionValue = `${btoa(payload)}.${signature}`;

    const response = NextResponse.json({ ok: true, role });
    response.cookies.set('__session', sessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('__session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
