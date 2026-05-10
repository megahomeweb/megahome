// Customer-facing notification sender
import { telegram } from './bot';
import { getDb } from './admin-app';
import { formatOrderNotification, formatStatusUpdate, formatWelcome } from './formatter';
import { mainMenuKeyboard } from './keyboards';

async function findTelegramUser(userUid: string) {
  const db = getDb();
  const snap = await db.collection('telegramUsers')
    .where('userUid', '==', userUid)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data();
}

export async function notifyOrderConfirmed(order: {
  id: string;
  clientName: string;
  totalPrice: number;
  totalQuantity: number;
  basketItems: { title: string; quantity: number }[];
  userUid: string;
}): Promise<void> {
  try {
    const telegramUser = await findTelegramUser(order.userUid);
    if (!telegramUser || !telegramUser.settings?.orderNotifications) return;

    await telegram.sendMessage(
      telegramUser.chatId,
      formatOrderNotification(order),
      { replyMarkup: mainMenuKeyboard() }
    );
  } catch (error) {
    console.error('Telegram notify order error:', error);
  }
}

export async function notifyOrderStatusChanged(order: {
  id: string;
  clientName: string;
  totalPrice: number;
  userUid: string;
}, newStatus: string): Promise<void> {
  try {
    const telegramUser = await findTelegramUser(order.userUid);
    if (!telegramUser || !telegramUser.settings?.orderNotifications) return;

    await telegram.sendMessage(
      telegramUser.chatId,
      formatStatusUpdate(order, newStatus)
    );
  } catch (error) {
    console.error('Telegram notify status error:', error);
  }
}

export async function notifyDeliveryArriving(order: {
  id: string;
  clientName: string;
  totalPrice: number;
  userUid: string;
}): Promise<void> {
  try {
    const telegramUser = await findTelegramUser(order.userUid);
    if (!telegramUser || !telegramUser.settings?.orderNotifications) return;

    await telegram.sendMessage(
      telegramUser.chatId,
      [
        '🚚 <b>Buyurtmangiz yo\'lda!</b>',
        '',
        `🆔 Buyurtma: <code>${order.id.slice(-8).toUpperCase()}</code>`,
        `💰 Summa: $${Number(order.totalPrice).toLocaleString('en-US')}`,
        '',
        '📞 Kuryer tez orada siz bilan bog\'lanadi.',
      ].join('\n')
    );
  } catch (error) {
    console.error('Telegram notify delivery error:', error);
  }
}

export async function notifyWelcome(chatId: number, userName: string): Promise<void> {
  try {
    await telegram.sendMessage(chatId, formatWelcome(userName), {
      replyMarkup: mainMenuKeyboard(),
    });
  } catch (error) {
    console.error('Telegram welcome error:', error);
  }
}
