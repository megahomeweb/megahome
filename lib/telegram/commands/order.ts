import { telegram } from '../bot';
import { getDb } from '../admin-app';
import { formatCartSummary, formatOrderNotification, formatNewOrderAlert } from '../formatter';
import { confirmOrderKeyboard, mainMenuKeyboard } from '../keyboards';
import { getCart, clearCart, handleAddToCart } from './cart';
import { readNextInvoiceNo, commitInvoiceNo } from '../../invoice-counter';

export async function handleOrder(chatId: number): Promise<void> {
  const db = getDb();

  // Check if user is linked
  const userSnap = await db.collection('telegramUsers')
    .where('chatId', '==', chatId)
    .limit(1)
    .get();

  if (userSnap.empty) {
    await telegram.sendMessage(chatId, '❌ Avval hisobingizni ulang: /start');
    return;
  }

  const items = await getCart(chatId);
  if (items.length === 0) {
    await telegram.sendMessage(chatId, '🛒 Savatcha bo\'sh.\n\n📦 /products — Mahsulotlarni ko\'ring');
    return;
  }

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const text = formatCartSummary(items, total);

  await telegram.sendMessage(
    chatId,
    text + '\n\n❓ <b>Buyurtmani tasdiqlaysizmi?</b>',
    { replyMarkup: confirmOrderKeyboard() }
  );
}

export async function handleConfirmOrder(chatId: number): Promise<void> {
  const db = getDb();

  // Get linked user + cart concurrently — both reads are independent.
  const [userSnap, items] = await Promise.all([
    db.collection('telegramUsers').where('chatId', '==', chatId).limit(1).get(),
    getCart(chatId),
  ]);

  if (userSnap.empty) {
    await telegram.sendMessage(chatId, '❌ Avval hisobingizni ulang: /start');
    return;
  }

  const telegramUser = userSnap.docs[0].data();
  const userUid = telegramUser.userUid;

  if (!userUid) {
    await telegram.sendMessage(chatId, '❌ Hisob ulanmagan. /start buyrug\'ini yuboring.');
    return;
  }

  // Get user profile
  const profileSnap = await db.collection('user').doc(userUid).get();
  if (!profileSnap.exists) {
    await telegram.sendMessage(chatId, '❌ Foydalanuvchi profili topilmadi.');
    return;
  }
  const profile = profileSnap.data()!;

  if (items.length === 0) {
    await telegram.sendMessage(chatId, '🛒 Savatcha bo\'sh.');
    return;
  }

  // Atomic validation + stock reservation inside a Firestore transaction,
  // mirroring /api/orders/create — same price/stock rules regardless of
  // whether the order was placed from the website or from the bot.
  let orderId = '';
  let orderInvoiceNo: number | undefined;
  let totalPrice = 0;
  let totalQuantity = 0;
  let basketItems: Array<{
    id: string; title: string; price: string; quantity: number;
    productImageUrl: { url: string; path: string }[]; category: string;
    description: string; costPrice?: number; subcategory?: string;
  }> = [];

  try {
    const result = await db.runTransaction(async (tx) => {
      const productRefs = items.map((i) => db.collection('products').doc(i.productId));
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
      // Same sequential schyot-faktura counter as /api/orders/create —
      // Telegram orders are part of the one numbering sequence.
      const nextInvoiceNo = await readNextInvoiceNo(db, tx);

      const snapshot: Array<{ id: string; available: number; quantity: number; data: FirebaseFirestore.DocumentData }> = [];
      for (let i = 0; i < productSnaps.length; i++) {
        const snap = productSnaps[i];
        const item = items[i];
        if (!snap.exists) {
          throw new Error(`"${item.title}" mahsulot topilmadi. /cart tekshiring.`);
        }
        const data = snap.data() ?? {};
        const available = typeof data.stock === 'number' ? data.stock : 0;
        if (available < item.quantity) {
          throw new Error(`"${data.title || item.title}" yetarli emas. Stokda: ${available} ta, savatchada: ${item.quantity} ta.`);
        }
        snapshot.push({ id: item.productId, available, quantity: item.quantity, data });
      }

      let tp = 0, tq = 0;
      const bi: typeof basketItems = [];
      for (const s of snapshot) {
        const priceNum = Number(s.data.price);
        tp += (Number.isFinite(priceNum) ? priceNum : 0) * s.quantity;
        tq += s.quantity;
        bi.push({
          id: s.id,
          title: String(s.data.title ?? ''),
          price: String(s.data.price ?? '0'),
          costPrice: typeof s.data.costPrice === 'number' ? s.data.costPrice : 0,
          category: String(s.data.category ?? ''),
          subcategory: s.data.subcategory ? String(s.data.subcategory) : undefined,
          description: String(s.data.description ?? ''),
          productImageUrl: Array.isArray(s.data.productImageUrl) ? s.data.productImageUrl : [],
          quantity: s.quantity,
        });
      }

      for (let i = 0; i < productRefs.length; i++) {
        tx.update(productRefs[i], { stock: snapshot[i].available - snapshot[i].quantity });
      }

      const orderRef = db.collection('orders').doc();
      tx.set(orderRef, {
        clientName: profile.name || '',
        clientPhone: profile.phone || '',
        date: new Date(),
        invoiceNo: nextInvoiceNo,
        basketItems: bi,
        totalPrice: tp,
        totalQuantity: tq,
        userUid,
        status: 'yangi',
        stockReserved: true,
        source: 'telegram',
        orderNote: 'Telegram bot orqali buyurtma',
      });
      commitInvoiceNo(db, tx, nextInvoiceNo);

      return { orderId: orderRef.id, invoiceNo: nextInvoiceNo, totalPrice: tp, totalQuantity: tq, basketItems: bi };
    });
    orderId = result.orderId;
    orderInvoiceNo = result.invoiceNo;
    totalPrice = result.totalPrice;
    totalQuantity = result.totalQuantity;
    basketItems = result.basketItems;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Buyurtma yaratilmadi';
    await telegram.sendMessage(chatId, `⚠️ ${msg}`);
    return;
  }

  // Clear cart (async, fire-and-forget — already reserved)
  clearCart(chatId).catch(() => {});

  // Log stock movements (fire-and-forget — audit trail)
  const ts = new Date();
  for (const item of basketItems) {
    db.collection('stockMovements').add({
      productId: item.id,
      productTitle: item.title,
      type: 'sotish',
      quantity: -item.quantity,
      reason: 'Buyurtma yaratildi (Telegram)',
      reference: orderId,
      timestamp: ts,
    }).catch((e) => console.error('stockMovement log failed:', e));
  }

  const orderRef = { id: orderId, invoiceNo: orderInvoiceNo };
  const summaryItems = items.map((i) => ({ title: i.title, quantity: i.quantity }));

  // Confirmation to the customer + new-order alert to the admin run in
  // parallel — both are Telegram sendMessage round-trips and neither
  // depends on the other. Admin alert failures are logged but do not
  // block the customer response.
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const adminAlert = adminChatId
    ? telegram.sendMessage(
        adminChatId,
        formatNewOrderAlert({
          id: orderRef.id,
          invoiceNo: orderRef.invoiceNo,
          clientName: profile.name || '',
          clientPhone: profile.phone || '',
          totalPrice,
          totalQuantity,
          basketItems: summaryItems,
        })
      ).catch((e) => console.error('[telegram-order] admin alert failed:', e))
    : Promise.resolve();

  await Promise.all([
    telegram.sendMessage(
      chatId,
      formatOrderNotification({
        id: orderRef.id,
        invoiceNo: orderRef.invoiceNo,
        clientName: profile.name || '',
        totalPrice,
        totalQuantity,
        basketItems: summaryItems,
      }),
      { replyMarkup: mainMenuKeyboard() }
    ),
    adminAlert,
  ]);
}

export async function handleCancelOrder(chatId: number): Promise<void> {
  await telegram.sendMessage(chatId, '❌ Buyurtma bekor qilindi. Savatcha saqlanib qoldi.', {
    replyMarkup: mainMenuKeyboard(),
  });
}

export async function handleReorder(chatId: number): Promise<void> {
  const db = getDb();

  // Get linked user
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
    await telegram.sendMessage(chatId, '❌ Hisob ulanmagan. /start buyrug\'ini yuboring.');
    return;
  }

  // Get last order
  const ordersSnap = await db.collection('orders')
    .where('userUid', '==', userUid)
    .orderBy('date', 'desc')
    .limit(1)
    .get();

  if (ordersSnap.empty) {
    await telegram.sendMessage(chatId, '📋 Sizda hali buyurtma yo\'q.');
    return;
  }

  const lastOrder = ordersSnap.docs[0].data();
  const basketItems = lastOrder.basketItems || [];

  // Clear current cart and add items from last order (sequential — cart
  // writes race if we don't serialise)
  await clearCart(chatId);
  for (const item of basketItems) {
    if (item.id) {
      await handleAddToCart(chatId, item.id, item.quantity || 1);
    }
  }

  await telegram.sendMessage(
    chatId,
    '🔄 Oxirgi buyurtmangiz savatchaga qo\'shildi!\n\n🛒 /cart — Savatchani ko\'ring'
  );
}
