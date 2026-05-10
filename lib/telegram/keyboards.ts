import type { InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup } from './types';

// Build inline keyboard from rows of buttons
function inline(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}

function btn(text: string, callbackData: string): InlineKeyboardButton {
  return { text, callback_data: callbackData };
}

function urlBtn(text: string, url: string): InlineKeyboardButton {
  return { text, url };
}

// ── Main menu ──
export function mainMenuKeyboard(): InlineKeyboardMarkup {
  return inline([
    [btn('📦 Mahsulotlar', 'menu:products'), btn('🛒 Savatcha', 'menu:cart')],
    [btn('📋 Buyurtmalarim', 'menu:myorders'), btn('🔁 Qayta buyurtma', 'menu:reorder')],
    [btn('⚙️ Sozlamalar', 'menu:settings'), btn('❓ Yordam', 'menu:help')],
  ]);
}

// ── Categories list ──
export function categoryKeyboard(categories: { id: string; name: string }[]): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row: InlineKeyboardButton[] = [btn(`📂 ${categories[i].name}`, `category:${categories[i].id}`)];
    if (categories[i + 1]) {
      row.push(btn(`📂 ${categories[i + 1].name}`, `category:${categories[i + 1].id}`));
    }
    rows.push(row);
  }
  rows.push([btn('🔙 Bosh menyu', 'back:main')]);
  return inline(rows);
}

// ── Products in category with pagination ──
export function productListKeyboard(
  products: { id: string; title: string; price: string }[],
  categoryId: string,
  page: number,
  totalPages: number
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = products.map((p) => [
    btn(`${p.title} — ${formatPriceShort(p.price)}`, `product:${p.id}`),
  ]);

  // Pagination
  if (totalPages > 1) {
    const navRow: InlineKeyboardButton[] = [];
    if (page > 0) navRow.push(btn('◀ Oldingi', `page:${categoryId}:${page - 1}`));
    navRow.push(btn(`${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) navRow.push(btn('Keyingi ▶', `page:${categoryId}:${page + 1}`));
    rows.push(navRow);
  }

  rows.push([btn('🔙 Kategoriyalar', 'back:categories')]);
  return inline(rows);
}

// ── Product detail (with bulk-quantity buttons for wholesale buyers) ──
export function productDetailKeyboard(productId: string, inStock: boolean): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [];
  if (inStock) {
    rows.push([btn("🛒 Savatchaga qo'shish (+1)", `cart_add:${productId}:1`)]);
    // Bulk qty for wholesale — without these, ordering 50 dona requires
    // 50 separate ➕ taps on the cart row.
    rows.push([
      btn('+5', `cart_add:${productId}:5`),
      btn('+10', `cart_add:${productId}:10`),
      btn('+50', `cart_add:${productId}:50`),
    ]);
  }
  rows.push([btn('🔙 Ortga', 'back:categories')]);
  return inline(rows);
}

// ── Cart (with bulk +/- buttons for wholesale buyers) ──
export function cartKeyboard(items: { productId: string; title: string; quantity: number }[]): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [];
  for (const item of items) {
    // Title + quantity display row + remove
    rows.push([
      btn(`${item.title} (${item.quantity})`, 'noop'),
      btn('🗑', `cart_remove:${item.productId}`),
    ]);
    // ±1 row + ±5 / ±10 — covers retail-tap and wholesale-bulk in one cart UI
    rows.push([
      btn('−10', `cart_qty:${item.productId}:-10`),
      btn('−1', `cart_qty:${item.productId}:-1`),
      btn('+1', `cart_qty:${item.productId}:1`),
      btn('+10', `cart_qty:${item.productId}:10`),
    ]);
  }

  rows.push([
    btn('✅ Buyurtma berish', 'order_confirm'),
    btn('🗑 Tozalash', 'cart_clear'),
  ]);
  rows.push([btn('🔙 Bosh menyu', 'back:main')]);
  return inline(rows);
}

// ── Empty cart ──
export function emptyCartKeyboard(): InlineKeyboardMarkup {
  return inline([
    [btn('📦 Mahsulotlar ko\'rish', 'menu:products')],
    [btn('🔙 Bosh menyu', 'back:main')],
  ]);
}

// ── Confirm order ──
export function confirmOrderKeyboard(): InlineKeyboardMarkup {
  return inline([
    [btn('✅ Tasdiqlash', 'order_do_confirm'), btn('❌ Bekor qilish', 'order_cancel')],
  ]);
}

// ── Order history ──
export function orderHistoryKeyboard(orders: { id: string; date: string; totalPrice: number; status: string }[]): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = orders.slice(0, 10).map((o) => [
    btn(`${statusEmoji(o.status)} ${o.date} — ${formatPriceShort(String(o.totalPrice))}`, `order_detail:${o.id}`),
  ]);
  rows.push([btn('🔙 Bosh menyu', 'back:main')]);
  return inline(rows);
}

// ── Settings toggles ──
export function settingsKeyboard(settings: { orderNotifications: boolean; promotions: boolean }): InlineKeyboardMarkup {
  return inline([
    [btn(`${settings.orderNotifications ? '✅' : '❌'} Buyurtma xabarlari`, 'settings:orderNotifications')],
    [btn(`${settings.promotions ? '✅' : '❌'} Aksiya va yangiliklar`, 'settings:promotions')],
    [btn('🔙 Bosh menyu', 'back:main')],
  ]);
}

// ── Phone request keyboard (reply keyboard, not inline) ──
export function requestContactKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

// ── Helpers ──
function formatPriceShort(price: string): string {
  return '$' + Number(price).toLocaleString('en-US');
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = {
    yangi: '🆕',
    tasdiqlangan: '✅',
    'yigʻilmoqda': '📦',
    yetkazilmoqda: '🚚',
    yetkazildi: '✅',
    bekor_qilindi: '❌',
  };
  return map[status] || '📋';
}
