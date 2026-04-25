// Re-export the canonical Admin SDK singleton from `lib/firebase-admin`.
// This file historically duplicated the init logic — kept as a thin re-export
// for backward-compat with imports across the telegram subsystem.
import * as admin from 'firebase-admin';
import { getAdminApp } from '@/lib/firebase-admin';

export { getAdminApp };

export function getDb() {
  return getAdminApp().firestore();
}

/**
 * Delete the `telegramUsers` doc(s) tied to a chatId — used when Telegram
 * reports the user has blocked the bot or the chat has been deleted. Keeps
 * the broadcast list clean so we don't burn quota and metrics on dead chats.
 */
export async function pruneBlockedTelegramUser(chatId: number | string): Promise<void> {
  try {
    const db = getDb();
    const snap = await db.collection('telegramUsers').where('chatId', '==', Number(chatId)).get();
    const batch = db.batch();
    let count = 0;
    snap.forEach((d) => {
      batch.delete(d.ref);
      count++;
    });
    if (count > 0) await batch.commit();
  } catch (err) {
    // Pruning is opportunistic — never propagate.
    console.error('[telegram] prune failed:', err);
  }
}

/**
 * Idempotency guard for Telegram webhook retries.
 * Returns `true` if this update_id is being seen for the FIRST time
 * (caller should process); `false` if already processed (caller should skip).
 *
 * Implementation: try to `create()` a doc keyed by update_id. Admin SDK's
 * `create()` throws ALREADY_EXISTS when the doc is present, giving us atomic
 * compare-and-set without a transaction round-trip.
 */
export async function claimUpdateId(updateId: number): Promise<boolean> {
  if (!Number.isFinite(updateId)) return true; // can't dedup, process to be safe
  try {
    await getDb()
      .collection('processedUpdates')
      .doc(String(updateId))
      .create({ processedAt: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code === 6 || code === 'already-exists') {
      return false; // duplicate retry — skip
    }
    // Any other error: fail open (process anyway). Better to risk a duplicate
    // order than silently drop a real one.
    console.error('[telegram] claimUpdateId unexpected error:', err);
    return true;
  }
}
