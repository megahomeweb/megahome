import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Resolve the HMAC verification secret. Same fix as
 * `app/api/auth/session/route.ts`: previous code fell back to
 * FIREBASE_PROJECT_ID (public) which let attackers forge cookies. We now
 * REQUIRE SESSION_SECRET at verify time. If misconfigured, no cookie can
 * pass verification — middleware sends users to /login, which is the
 * correct fail-closed behaviour for an auth gate.
 */
function getSessionSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) return null;
  return s;
}

async function verifySession(sessionValue: string): Promise<{ role: string; uid: string } | null> {
  try {
    const secret = getSessionSecret();
    if (!secret) return null; // fail-closed when misconfigured

    const dotIndex = sessionValue.lastIndexOf('.');
    if (dotIndex === -1) return null; // Old unsigned cookie format — reject

    const payloadB64 = sessionValue.slice(0, dotIndex);
    const signature = sessionValue.slice(dotIndex + 1);
    if (!payloadB64 || !signature) return null;

    const payload = atob(payloadB64);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBuffer, encoder.encode(payload));
    if (!isValid) return null;

    const data = JSON.parse(payload);

    // Check expiry
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;

    return { role: data.role, uid: data.uid };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    const session = request.cookies.get('__session');

    if (!session?.value) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const sessionData = await verifySession(session.value);
    if (!sessionData || (sessionData.role !== 'admin' && sessionData.role !== 'manager')) {
      // Invalid or forged cookie — clear it and redirect
      const loginUrl = new URL('/login', request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set('__session', '', { path: '/', maxAge: 0 });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
