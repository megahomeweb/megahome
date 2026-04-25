import { telegram } from '../bot';
import { getDb } from '../admin-app';
import { formatWelcome } from '../formatter';
import { mainMenuKeyboard, requestContactKeyboard } from '../keyboards';
import type { TelegramUser, TelegramMessage, ReplyKeyboardRemove } from '../types';

export async function handleStart(chatId: number, from?: TelegramUser, startPayload?: string): Promise<void> {
  const db = getDb();

  // Parse referral deeplink — `/start ref_<uid>` (Telegram supports this
  // natively via `t.me/yourbot?start=ref_<uid>`). On first link, we tag
  // the new telegramUsers doc with `referredByUid` so the admin can credit
  // the referrer when the referee's first paid order is delivered.
  const referrerUid = parseReferralPayload(startPayload);

  // Check if already linked
  const existingSnap = await db.collection('telegramUsers')
    .where('chatId', '==', chatId)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const data = existingSnap.docs[0].data();
    const name = data.userName || from?.first_name || 'Foydalanuvchi';
    await telegram.sendMessage(chatId, formatWelcome(name), {
      replyMarkup: mainMenuKeyboard(),
    });
    // Update last activity (and lock in referrer if first time hitting /start
    // with a referral payload — never overwrite an existing one to prevent
    // farming via repeated relinks)
    const updates: Record<string, unknown> = { lastActivity: new Date() };
    if (referrerUid && !data.referredByUid && referrerUid !== data.userUid) {
      updates.referredByUid = referrerUid;
      updates.referredAt = new Date();
    }
    await existingSnap.docs[0].ref.update(updates);
    return;
  }

  // Stash the referral on the chat itself (pre-link) so handleContact picks
  // it up after the customer shares their phone number.
  if (referrerUid) {
    await db.collection('telegramPendingRefs').doc(String(chatId)).set({
      referrerUid,
      createdAt: new Date(),
    });
  }

  // Not linked — ask for phone number
  await telegram.sendMessage(
    chatId,
    [
      `👋 Salom, <b>${from?.first_name || 'do\'stim'}</b>!`,
      '',
      '🏪 <b>MegaHome Ulgurji</b> botiga xush kelibsiz!',
      ...(referrerUid ? ['', '🎁 Sizni do\'stingiz tavsiya qildi — birinchi buyurtmangiz uchun bonus oling!'] : []),
      '',
      '📱 Hisobingizni ulash uchun telefon raqamingizni yuboring.',
      'Quyidagi tugmani bosing:',
    ].join('\n'),
    { replyMarkup: requestContactKeyboard() }
  );
}

/**
 * Parse the `/start <payload>` text. Returns the referrer's uid if the
 * payload is `ref_<uid>` and the uid looks like a non-empty alphanum string.
 */
function parseReferralPayload(payload?: string): string | null {
  if (!payload) return null;
  const trimmed = payload.trim();
  if (!trimmed.startsWith('ref_')) return null;
  const uid = trimmed.slice(4);
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(uid)) return null;
  return uid;
}

export async function handleContact(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const contact = message.contact;
  if (!contact) return;

  const db = getDb();
  const phone = normalizePhone(contact.phone_number);
  const from = message.from;
  let matchedUser: { uid: string; name: string; phone: string; role: string } | null = null;

  // Fast path — env-var admin whitelist. Auto-provisions a `user` doc with
  // role=admin so the operator can bootstrap admin access via Telegram
  // without signing up on the website first. Also skips the full-collection
  // scan below, which is O(n) on the user table.
  const adminPhones = (process.env.TELEGRAM_ADMIN_PHONES || '')
    .split(',')
    .map((p) => normalizePhone(p))
    .filter((p) => p.length >= 9);

  if (phone.length >= 9 && adminPhones.includes(phone)) {
    const adminUid = `tg-admin-${chatId}`;
    const adminData = {
      uid: adminUid,
      name: from?.first_name || 'Admin',
      email: '',
      phone: contact.phone_number,
      role: 'admin' as const,
      time: Date.now(),
      date: new Date().toISOString(),
      createdVia: 'telegram-whitelist',
    };
    await db.collection('user').doc(adminUid).set(adminData, { merge: true });
    matchedUser = {
      uid: adminUid,
      name: adminData.name,
      phone: adminData.phone,
      role: 'admin',
    };
  }

  // Fallback — search `user` collection for the phone. Full scan because the
  // legacy docs don't have a normalized phone field; amortised away by the
  // admin fast path above and by short-circuiting as soon as we match.
  if (!matchedUser) {
    const usersSnap = await db.collection('user').get();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const userPhone = normalizePhone(data.phone || '');
      if (userPhone === phone && phone.length >= 9) {
        matchedUser = {
          uid: doc.id,
          name: data.name || '',
          phone: data.phone || '',
          role: data.role || 'user',
        };
        break;
      }
    }
  }

  if (!matchedUser) {
    const signUpUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://megahome.app').replace(/\/$/, '')}/sign-up`;
    // Remove the reply keyboard
    const removeKb: ReplyKeyboardRemove = { remove_keyboard: true };
    await telegram.sendMessage(
      chatId,
      [
        '❌ <b>Hisob topilmadi</b>',
        '',
        'Bu telefon raqam bilan ro\'yxatdan o\'tilmagan.',
        '📝 Avval saytda ro\'yxatdan o\'ting:',
        signUpUrl,
        '',
        'Ro\'yxatdan o\'tgandan so\'ng /start buyrug\'ini yuboring.',
      ].join('\n'),
      { replyMarkup: removeKb }
    );
    return;
  }

  // Pull pending referral (if any) stashed by handleStart and tag the
  // telegramUsers doc with referredByUid so the admin can credit the
  // referrer on the referee's first delivered paid order.
  let referredByUid: string | null = null;
  try {
    const refDoc = await db.collection('telegramPendingRefs').doc(String(chatId)).get();
    if (refDoc.exists) {
      const refUid = String(refDoc.data()?.referrerUid || '');
      if (refUid && refUid !== matchedUser.uid) {
        referredByUid = refUid;
      }
      // Clear regardless — single-use stash
      await refDoc.ref.delete().catch(() => {});
    }
  } catch (err) {
    console.error('[telegram] referral pickup failed:', err);
  }

  // Create or update telegramUsers document
  const telegramUserData: Record<string, unknown> = {
    chatId,
    userUid: matchedUser.uid,
    phone: matchedUser.phone,
    userName: matchedUser.name,
    isAdmin: matchedUser.role === 'admin',
    linkedAt: new Date(),
    lastActivity: new Date(),
    settings: {
      orderNotifications: true,
      promotions: true,
    },
  };
  if (referredByUid) {
    telegramUserData.referredByUid = referredByUid;
    telegramUserData.referredAt = new Date();
  }

  // Check if already exists (by chatId)
  const existingSnap = await db.collection('telegramUsers')
    .where('chatId', '==', chatId)
    .limit(1)
    .get();

  if (existingSnap.empty) {
    await db.collection('telegramUsers').add(telegramUserData);
  } else {
    // Don't overwrite an existing referredByUid — first referrer wins.
    if (existingSnap.docs[0].data()?.referredByUid) {
      delete telegramUserData.referredByUid;
      delete telegramUserData.referredAt;
    }
    await existingSnap.docs[0].ref.update(telegramUserData);
  }

  // Also tag the main user doc so the website can surface "referred by" too.
  if (referredByUid) {
    await db.collection('user').doc(matchedUser.uid).set(
      { referredByUid, referredAt: new Date() },
      { merge: true },
    );
  }

  // Remove the reply keyboard and send welcome
  const removeKb: ReplyKeyboardRemove = { remove_keyboard: true };
  await telegram.sendMessage(chatId, '✅ Hisobingiz muvaffaqiyatli ulandi!', {
    replyMarkup: removeKb,
  });
  await telegram.sendMessage(chatId, formatWelcome(matchedUser.name), {
    replyMarkup: mainMenuKeyboard(),
  });
}

function normalizePhone(phone: string): string {
  // Extract last 9 digits (Uzbek mobile numbers)
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-9);
}
