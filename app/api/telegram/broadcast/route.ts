import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAdminEmail } from '@/lib/admin-config';
import { telegram } from '@/lib/telegram/bot';

/**
 * Admin → all-linked-users broadcast.
 *
 * Hardened against three prior issues:
 *   1. Respects `settings.promotions` opt-out — we never spam users who
 *      turned off promotions in /settings.
 *   2. Throttles to ~15 msg/sec (Telegram's safe bot-broadcast ceiling)
 *      so Telegram doesn't rate-limit the entire bot account.
 *   3. Admin-only: caller must present a Firebase ID token AND have
 *      role=admin in /user/{uid}. Previously only required a valid
 *      token, which any logged-in user could produce.
 */

const BATCH_SIZE = 15;
const BATCH_DELAY_MS = 1000; // 15 msg/sec = ~900 msg/min, under the 30/sec group limit

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const adminApp = getAdminApp();
    let callerEmail: string | null = null;
    try {
      const decoded = await adminApp.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      callerEmail = decoded.email ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    // Email-claim gate, consistent with all other admin-only routes.
    if (!isAdminEmail(callerEmail)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { text, includeOptedOut } = await req.json();
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text required' }, { status: 400 });
    }
    if (text.length > 4000) {
      return NextResponse.json({ error: 'Text too long (max 4000 chars)' }, { status: 400 });
    }

    const db = adminApp.firestore();
    const snap = await db.collection('telegramUsers').get();

    const recipients: number[] = [];
    let skippedOptedOut = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.chatId) continue;
      if (!includeOptedOut && data.settings?.promotions === false) {
        skippedOptedOut++;
        continue;
      }
      recipients.push(data.chatId);
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((chatId) => telegram.sendMessage(chatId, text)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && (r.value as { ok?: boolean })?.ok !== false) sent++;
        else failed++;
      }
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      failed,
      skippedOptedOut,
      total: snap.size,
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    return NextResponse.json({ error: 'Broadcast failed' }, { status: 500 });
  }
}
