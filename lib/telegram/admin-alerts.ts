// Admin-facing alert sender — sends to TELEGRAM_ADMIN_CHAT_ID
import { telegram } from './bot';
import { formatNewOrderAlert, formatLowStockAlert, formatDailySummary } from './formatter';

const getAdminChatId = () => process.env.TELEGRAM_ADMIN_CHAT_ID;

export async function alertNewOrder(order: {
  id: string;
  invoiceNo?: number;
  clientName: string;
  clientPhone: string;
  totalPrice: number;
  totalQuantity: number;
  basketItems: { title: string; quantity: number }[];
}): Promise<void> {
  const chatId = getAdminChatId();
  if (!chatId) return;

  try {
    await telegram.sendMessage(chatId, formatNewOrderAlert(order));
  } catch (error) {
    console.error('Telegram admin alert (new order) error:', error);
  }
}

export async function alertLowStock(products: { title: string; stock: number }[]): Promise<void> {
  const chatId = getAdminChatId();
  if (!chatId || products.length === 0) return;

  try {
    await telegram.sendMessage(chatId, formatLowStockAlert(products));
  } catch (error) {
    console.error('Telegram admin alert (low stock) error:', error);
  }
}

export async function alertNewUser(userData: {
  name: string;
  email: string;
  phone: string;
}): Promise<void> {
  const chatId = getAdminChatId();
  if (!chatId) return;

  try {
    await telegram.sendMessage(
      chatId,
      [
        '👤 <b>Yangi foydalanuvchi ro\'yxatdan o\'tdi!</b>',
        '',
        `📛 Ism: <b>${userData.name}</b>`,
        `📧 Email: ${userData.email}`,
        `📞 Telefon: ${userData.phone}`,
      ].join('\n')
    );
  } catch (error) {
    console.error('Telegram admin alert (new user) error:', error);
  }
}

export async function alertDailySummary(data: {
  totalOrders: number;
  newOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  revenue: number;
  profit: number;
  lowStockCount: number;
  newUsers: number;
  date: string;
}): Promise<void> {
  const chatId = getAdminChatId();
  if (!chatId) return;

  try {
    await telegram.sendMessage(chatId, formatDailySummary(data));
  } catch (error) {
    console.error('Telegram admin alert (daily summary) error:', error);
  }
}
