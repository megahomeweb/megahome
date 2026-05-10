// Message formatting utilities for Telegram bot — all text in Uzbek

const STATUS_LABELS: Record<string, string> = {
  yangi: '🆕 Yangi',
  tasdiqlangan: '✅ Tasdiqlangan',
  'yigʻilmoqda': '📦 Yig\'ilmoqda',
  yetkazilmoqda: '🚚 Yetkazilmoqda',
  yetkazildi: '✅ Yetkazildi',
  bekor_qilindi: '❌ Bekor qilindi',
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPrice(price: string | number): string {
  return '$' + Number(price).toLocaleString('en-US');
}

export function formatWelcome(userName: string): string {
  return [
    `👋 Xush kelibsiz, <b>${escapeHtml(userName)}</b>!`,
    '',
    '🏪 <b>MegaHome Ulgurji</b> botiga xush kelibsiz!',
    '',
    'Bu bot orqali siz:',
    '📦 Mahsulotlarni ko\'rishingiz',
    '🛒 Buyurtma berishingiz',
    '📋 Buyurtmalar tarixini ko\'rishingiz mumkin',
    '',
    'Quyidagi menyudan tanlang:',
  ].join('\n');
}

export function formatHelp(): string {
  return [
    '❓ <b>Yordam — MegaHome Bot</b>',
    '',
    '📌 <b>Buyruqlar:</b>',
    '/start — Botni ishga tushirish',
    '/products — Mahsulotlarni ko\'rish',
    '/cart — Savatchani ko\'rish',
    '/order — Buyurtma berish',
    '/reorder — Oxirgi buyurtmani takrorlash',
    '/myorders — Buyurtmalar tarixi',
    '/settings — Xabar sozlamalari',
    '/help — Yordam',
    '',
    '📞 <b>Aloqa:</b>',
    process.env.TELEGRAM_SUPPORT_PHONE
      ? `Telefon: ${process.env.TELEGRAM_SUPPORT_PHONE}`
      : 'Telefon: @megahome_admin',
    'Sayt: https://www.megahome.app',
  ].join('\n');
}

export function formatProductCard(product: {
  title: string;
  price: string;
  description?: string;
  category?: string;
  stock?: number;
}): string {
  const lines = [
    `📦 <b>${escapeHtml(product.title)}</b>`,
    '',
    `💰 Narxi: <b>${formatPrice(product.price)}</b>`,
  ];

  if (product.category) {
    lines.push(`📂 Kategoriya: ${escapeHtml(product.category)}`);
  }

  if (product.stock !== undefined) {
    lines.push(
      product.stock > 0
        ? `📊 Mavjud: <b>${product.stock} ta</b>`
        : '🔴 <b>Tugagan</b>'
    );
  }

  if (product.description) {
    lines.push('', escapeHtml(product.description));
  }

  return lines.join('\n');
}

export function formatCartSummary(
  items: { title: string; price: number; quantity: number }[],
  total: number
): string {
  if (items.length === 0) {
    return '🛒 Savatchangiz bo\'sh.\n\n📦 /products — Mahsulotlarni ko\'ring';
  }

  const lines = ['🛒 <b>Savatcha</b>', ''];
  items.forEach((item, i) => {
    lines.push(
      `${i + 1}. ${escapeHtml(item.title)}`,
      `   ${item.quantity} x ${formatPrice(item.price)} = <b>${formatPrice(item.price * item.quantity)}</b>`
    );
  });

  lines.push('', `💰 <b>Jami: ${formatPrice(total)}</b>`);
  return lines.join('\n');
}

export function formatOrderNotification(order: {
  id: string;
  clientName: string;
  totalPrice: number;
  totalQuantity: number;
  basketItems: { title: string; quantity: number }[];
}): string {
  const items = order.basketItems
    .slice(0, 10)
    .map((item, i) => `${i + 1}. ${escapeHtml(item.title)} — ${item.quantity} ta`)
    .join('\n');

  return [
    '✅ <b>Buyurtmangiz qabul qilindi!</b>',
    '',
    `🆔 Buyurtma: <code>${order.id.slice(-8).toUpperCase()}</code>`,
    `📦 Mahsulotlar: ${order.totalQuantity} ta`,
    `💰 Jami: <b>${formatPrice(order.totalPrice)}</b>`,
    '',
    items,
    '',
    '📞 Tez orada siz bilan bog\'lanamiz!',
  ].join('\n');
}

export function formatStatusUpdate(
  order: { id: string; clientName: string; totalPrice: number },
  newStatus: string
): string {
  const label = STATUS_LABELS[newStatus] || newStatus;
  return [
    `📋 <b>Buyurtma holati yangilandi</b>`,
    '',
    `🆔 Buyurtma: <code>${order.id.slice(-8).toUpperCase()}</code>`,
    `📊 Holat: ${label}`,
    `💰 Summa: ${formatPrice(order.totalPrice)}`,
  ].join('\n');
}

// ── Admin alerts ──

export function formatNewOrderAlert(order: {
  id: string;
  clientName: string;
  clientPhone: string;
  totalPrice: number;
  totalQuantity: number;
  basketItems: { title: string; quantity: number }[];
}): string {
  const items = order.basketItems
    .slice(0, 8)
    .map((item) => `• ${escapeHtml(item.title)} — ${item.quantity} ta`)
    .join('\n');

  return [
    '🔔 <b>YANGI BUYURTMA!</b>',
    '',
    `👤 Mijoz: <b>${escapeHtml(order.clientName)}</b>`,
    `📞 Telefon: ${order.clientPhone}`,
    `💰 Summa: <b>${formatPrice(order.totalPrice)}</b>`,
    `📦 Mahsulotlar: ${order.totalQuantity} ta`,
    '',
    items,
    order.basketItems.length > 8 ? `\n... va yana ${order.basketItems.length - 8} ta` : '',
  ].join('\n');
}

export function formatLowStockAlert(products: { title: string; stock: number }[]): string {
  const lines = [
    '⚠️ <b>KAM QOLGAN MAHSULOTLAR</b>',
    '',
  ];

  products.slice(0, 15).forEach((p) => {
    const emoji = (p.stock ?? 0) <= 0 ? '🔴' : '🟡';
    lines.push(`${emoji} ${escapeHtml(p.title)} — <b>${p.stock ?? 0} ta</b>`);
  });

  if (products.length > 15) {
    lines.push(`\n... va yana ${products.length - 15} ta mahsulot`);
  }

  return lines.join('\n');
}

export function formatDailySummary(data: {
  totalOrders: number;
  newOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  revenue: number;
  profit: number;
  lowStockCount: number;
  newUsers: number;
  date: string;
}): string {
  return [
    `📊 <b>Kunlik hisobot — ${data.date}</b>`,
    '',
    `📦 Buyurtmalar: <b>${data.totalOrders}</b>`,
    `  🆕 Yangi: ${data.newOrders}`,
    `  ✅ Yetkazildi: ${data.deliveredOrders}`,
    `  ❌ Bekor: ${data.cancelledOrders}`,
    '',
    `💰 Daromad: <b>${formatPrice(data.revenue)}</b>`,
    `📈 Foyda: <b>${formatPrice(data.profit)}</b>`,
    '',
    `⚠️ Kam qolgan: ${data.lowStockCount} ta mahsulot`,
    `👤 Yangi foydalanuvchilar: ${data.newUsers}`,
  ].join('\n');
}

// ── Channel posts ──

export function formatNewProductPost(product: {
  id: string;
  title: string;
  price: string;
  category: string;
  description?: string;
}): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://megahome.app';
  return [
    '🆕 <b>YANGI MAHSULOT!</b>',
    '',
    `📦 <b>${escapeHtml(product.title)}</b>`,
    `💰 Narxi: <b>${formatPrice(product.price)}</b>`,
    `📂 Kategoriya: ${escapeHtml(product.category)}`,
    product.description ? `\n${escapeHtml(product.description)}` : '',
    '',
    `🛒 Buyurtma berish: ${siteUrl}/product/${product.id}`,
  ].join('\n');
}

export function formatPriceDropPost(product: {
  id: string;
  title: string;
}, oldPrice: number, newPrice: number): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://megahome.app';
  const percent = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
  return [
    '🔥 <b>NARX TUSHDI!</b>',
    '',
    `📦 <b>${escapeHtml(product.title)}</b>`,
    `💰 Eski narx: <s>${formatPrice(oldPrice)}</s>`,
    `🎯 Yangi narx: <b>${formatPrice(newPrice)}</b>`,
    `📉 Chegirma: <b>${percent}%</b>`,
    '',
    `🛒 Hoziroq buyurtma bering: ${siteUrl}/product/${product.id}`,
  ].join('\n');
}

export function formatBackInStockPost(product: {
  id: string;
  title: string;
  price: string;
  stock?: number;
}): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://megahome.app';
  return [
    '✅ <b>YANA MAVJUD!</b>',
    '',
    `📦 <b>${escapeHtml(product.title)}</b>`,
    `💰 Narxi: <b>${formatPrice(product.price)}</b>`,
    `📊 Stok: <b>${product.stock ?? 0} ta</b>`,
    '',
    `🛒 Buyurtma berish: ${siteUrl}/product/${product.id}`,
  ].join('\n');
}
