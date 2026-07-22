// Access gate for price-bearing bot flows (catalog, cart, orders).
//
// Two things are enforced here:
//   1. The chat must be LINKED to a website account (phone shared via
//      /start). Before this gate existed, /products handed the full
//      wholesale catalog WITH prices to any anonymous Telegram chat.
//   2. The linked account must be APPROVED. Prospects (role='prospect',
//      Ehtimoliy foydalanuvchi) signed up but the admin hasn't verified
//      them yet — they get a "pending" message instead of prices.
//
// The role is read live from the `user` doc on every guarded interaction
// (not from the snapshot stored on telegramUsers at link time), so an
// admin approval takes effect in the bot immediately — no re-linking.
import { getDb } from './admin-app';
import { telegram } from './bot';

type LinkedAccess =
  | { status: 'unlinked' }
  | { status: 'prospect'; userUid: string }
  | { status: 'approved'; userUid: string; role: string };

export async function getLinkedAccess(chatId: number): Promise<LinkedAccess> {
  const db = getDb();
  const linkSnap = await db
    .collection('telegramUsers')
    .where('chatId', '==', chatId)
    .limit(1)
    .get();
  if (linkSnap.empty) return { status: 'unlinked' };

  const userUid = String(linkSnap.docs[0].data().userUid || '');
  if (!userUid) return { status: 'unlinked' };

  const userDoc = await db.collection('user').doc(userUid).get();
  if (!userDoc.exists) return { status: 'unlinked' };

  // Legacy docs without a role field predate the approval workflow and
  // count as approved customers.
  const role = String(userDoc.data()?.role || 'user');
  if (role === 'prospect') return { status: 'prospect', userUid };
  return { status: 'approved', userUid, role };
}

/**
 * Returns true when the chat may access prices/ordering. Otherwise sends
 * the appropriate short message itself and returns false — callers just
 * `if (!(await requireApprovedAccess(chatId))) return;`
 */
export async function requireApprovedAccess(chatId: number): Promise<boolean> {
  const access = await getLinkedAccess(chatId);
  if (access.status === 'approved') return true;

  if (access.status === 'prospect') {
    await telegram.sendMessage(
      chatId,
      "⏳ Hisobingiz hali tasdiqlanmagan. Tez orada qo'ng'iroq qilamiz."
    );
  } else {
    await telegram.sendMessage(chatId, '❌ Avval hisobingizni ulang: /start');
  }
  return false;
}
