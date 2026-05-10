import { telegram } from '../bot';
import { getDb } from '../admin-app';
import { formatStatusUpdate, escapeHtml } from '../formatter';
import { orderHistoryKeyboard, mainMenuKeyboard } from '../keyboards';

const STATUS_LABELS: Record<string, string> = {
  yangi: '🆕 Yangi',
  tasdiqlangan: '✅ Tasdiqlangan',
  'yigʻilmoqda': '📦 Yig\'ilmoqda',
  yetkazilmoqda: '🚚 Yetkazilmoqda',
  yetkazildi: '✅ Yetkazildi',
  bekor_qilindi: '❌ Bekor qilindi',
};

export async function handleMyOrders(chatId: number): Promise<void> {
  const db = getDb();

  const userSnap = await db.collection('telegramUsers')
    .where('chatId', '==', chatId)
    .limit(1)
    .get();

  if (userSnap.empty) {
    await telegram.sendMessage(chatId, '❌ Avval hisobingizni ulang: /start');
    return;
  }

  const userUid = userSnap.docs[0].data().userUid;
  if (!userUid) {
    await telegram.sendMessage(chatId, '❌ Hisob ulanmagan.');
    return;
  }

  const ordersSnap = await db.collection('orders')
    .where('userUid', '==', userUid)
    .orderBy('date', 'desc')
    .limit(10)
    .get();

  if (ordersSnap.empty) {
    await telegram.sendMessage(chatId, '📋 Sizda hali buyurtmalar yo\'q.', {
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  const orders = ordersSnap.docs.map((d) => {
    const data = d.data();
    const dateObj = data.date?.toDate?.() || new Date(data.date?.seconds * 1000 || Date.now());
    return {
      id: d.id,
      date: dateObj.toLocaleDateString('uz-UZ'),
      totalPrice: data.totalPrice || 0,
      status: data.status || 'yangi',
    };
  });

  await telegram.sendMessage(
    chatId,
    '📋 <b>Buyurtmalar tarixi</b> (oxirgi 10 ta)\n\nBatafsil ko\'rish uchun tanlang:',
    { replyMarkup: orderHistoryKeyboard(orders) }
  );
}

export async function handleOrderDetail(chatId: number, orderId: string): Promise<void> {
  const db = getDb();
  const doc = await db.collection('orders').doc(orderId).get();

  if (!doc.exists) {
    await telegram.sendMessage(chatId, '❌ Buyurtma topilmadi.');
    return;
  }

  const data = doc.data()!;
  const dateObj = data.date?.toDate?.() || new Date(data.date?.seconds * 1000 || Date.now());
  const statusLabel = STATUS_LABELS[data.status || 'yangi'] || data.status;

  const items = (data.basketItems || [])
    .slice(0, 15)
    .map((item: { title: string; quantity: number; price: string }, i: number) =>
      `${i + 1}. ${escapeHtml(item.title)} — ${item.quantity} ta x ${formatPriceInline(item.price)}`
    )
    .join('\n');

  const text = [
    `📋 <b>Buyurtma tafsiloti</b>`,
    '',
    `🆔 Raqam: <code>${orderId.slice(-8).toUpperCase()}</code>`,
    `📅 Sana: ${dateObj.toLocaleDateString('uz-UZ')}`,
    `📊 Holat: ${statusLabel}`,
    '',
    `<b>Mahsulotlar:</b>`,
    items,
    '',
    `📦 Jami: ${data.totalQuantity} ta`,
    `💰 Summa: <b>${formatPriceInline(String(data.totalPrice))}</b>`,
    data.deliveryAddress ? `\n📍 Manzil: ${escapeHtml(data.deliveryAddress)}` : '',
    data.orderNote ? `📝 Izoh: ${escapeHtml(data.orderNote)}` : '',
  ].filter(Boolean).join('\n');

  await telegram.sendMessage(chatId, text, { replyMarkup: mainMenuKeyboard() });
}

function formatPriceInline(price: string): string {
  return '$' + Number(price).toLocaleString('en-US');
}
