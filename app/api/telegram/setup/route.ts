import { NextRequest, NextResponse } from 'next/server';
import { telegram } from '@/lib/telegram/bot';

/**
 * Provision the Telegram webhook URL with the bot.
 *
 * Auth model: secret is supplied via the Authorization header
 * (`Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>`) or as a JSON body
 * field on POST. The previous query-param transport leaked the secret
 * into HTTP access logs, browser history, and Referer headers — none of
 * which the operator controls.
 *
 * Backward compat: query-param transport is permanently rejected so
 * stale dashboards / scripts that still use it fail loudly rather than
 * silently log the secret.
 */

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function readSuppliedSecret(req: NextRequest): string | null {
  // Header is the preferred transport.
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() || null;
  }
  // Allow a custom header too, since the bot's own webhook handler
  // already uses x-telegram-bot-api-secret-token.
  const custom = req.headers.get('x-telegram-setup-secret');
  if (custom) return custom.trim();
  return null;
}

async function handle(req: NextRequest, suppliedFromBody?: string | null) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || expectedSecret.length < 8) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const supplied = readSuppliedSecret(req) ?? suppliedFromBody ?? null;
  if (!supplied || !constantTimeEqual(supplied, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

    const result = await telegram.setWebhook(webhookUrl, expectedSecret);
    const botInfo = await telegram.getMe();

    return NextResponse.json({
      success: true,
      webhookUrl,
      bot: botInfo.result,
      webhookResult: result,
    });
  } catch (error) {
    console.error('Telegram setup error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Setup failed',
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Reject query-param secret outright — would leak via logs/history.
  if (req.nextUrl.searchParams.has('secret')) {
    return NextResponse.json(
      { error: 'Use Authorization: Bearer <secret> header, not ?secret query param' },
      { status: 400 },
    );
  }
  return handle(req);
}

export async function POST(req: NextRequest) {
  let suppliedFromBody: string | null = null;
  try {
    const body = (await req.json()) as { secret?: unknown };
    if (typeof body?.secret === 'string') suppliedFromBody = body.secret;
  } catch {
    // Empty body is OK — header may carry the secret instead.
  }
  return handle(req, suppliedFromBody);
}
