// Main Telegram update dispatcher — routes messages and callbacks to handlers
import type { TelegramUpdate, TelegramMessage, TelegramCallbackQuery } from './types';
import { telegram } from './bot';
import { handleStart, handleContact } from './commands/start';
import { handleHelp } from './commands/help';
import { handleSettings, handleSettingsToggle } from './commands/settings';
import { handleProducts, handleCategoryProducts, handleProductDetail } from './commands/products';
import { handleCart, handleAddToCart, handleRemoveFromCart, handleUpdateCartQty, handleClearCart } from './commands/cart';
import { handleOrder, handleConfirmOrder, handleCancelOrder, handleReorder } from './commands/order';
import { handleMyOrders, handleOrderDetail } from './commands/myorders';
import { formatHelp } from './formatter';
import { mainMenuKeyboard } from './keyboards';
import { requireApprovedAccess } from './access';

// Every command/callback that exposes prices or ordering requires a
// linked AND approved (non-prospect) account — enforced centrally here
// so no individual handler can forget the check. /start, /help and
// /settings stay open.
const GUARDED_COMMANDS = new Set([
  '/products', '/mahsulotlar',
  '/order', '/buyurtma',
  '/reorder', '/qayta',
  '/myorders', '/buyurtmalarim',
  '/cart', '/savatcha',
]);
const GUARDED_ACTIONS = new Set([
  'category', 'product', 'page',
  'cart_add', 'cart_remove', 'cart_qty', 'cart_clear',
  'order_confirm', 'order_do_confirm', 'order_cancel', 'order_detail',
]);
const GUARDED_MENU_SECTIONS = new Set(['products', 'cart', 'myorders', 'reorder']);

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message?.contact) {
      await handleContact(update.message);
    } else if (update.message?.text) {
      await handleCommand(update.message);
    }
  } catch (error) {
    console.error('Error handling update:', error);
  }
}

async function handleCommand(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const command = text.split(' ')[0].toLowerCase().replace(/@\w+$/, ''); // strip bot username

  if (GUARDED_COMMANDS.has(command) && !(await requireApprovedAccess(chatId))) return;

  switch (command) {
    case '/start': {
      // Telegram supports start payload via `t.me/yourbot?start=<payload>` —
      // we use it for referral deeplinks (`ref_<uid>`) and any future
      // campaign codes.
      const payload = text.split(' ').slice(1).join(' ').trim() || undefined;
      return handleStart(chatId, message.from, payload);
    }
    case '/products':
    case '/mahsulotlar':
      return handleProducts(chatId);
    case '/order':
    case '/buyurtma':
      return handleOrder(chatId);
    case '/reorder':
    case '/qayta':
      return handleReorder(chatId);
    case '/myorders':
    case '/buyurtmalarim':
      return handleMyOrders(chatId);
    case '/cart':
    case '/savatcha':
      return handleCart(chatId);
    case '/settings':
    case '/sozlamalar':
      return handleSettings(chatId);
    case '/help':
    case '/yordam':
      return handleHelp(chatId);
    default:
      // Unknown command — show help
      await telegram.sendMessage(chatId, formatHelp(), { replyMarkup: mainMenuKeyboard() });
  }
}

async function handleCallback(query: TelegramCallbackQuery): Promise<void> {
  const chatId = query.message?.chat.id;
  if (!chatId || !query.data) return;

  // Fire the ack in parallel with the real work — removes the loading
  // spinner on the client without blocking the handler on a round-trip
  // to api.telegram.org. Errors are logged but don't abort dispatch.
  const ack = telegram.answerCallbackQuery(query.id).catch((err) => {
    console.error('[telegram-callback] ack failed:', err);
  });

  const [action, ...params] = query.data.split(':');
  const work = dispatchCallback(chatId, action, params);
  await Promise.all([ack, work]);
}

async function dispatchCallback(chatId: number, action: string, params: string[]): Promise<void> {
  if (GUARDED_ACTIONS.has(action) && !(await requireApprovedAccess(chatId))) return;

  switch (action) {
    // Menu navigation
    case 'menu':
      return handleMenuAction(chatId, params[0]);
    case 'back':
      return handleBackAction(chatId, params[0]);

    // Products
    case 'category':
      return handleCategoryProducts(chatId, params[0], 0);
    case 'product':
      return handleProductDetail(chatId, params[0]);
    case 'page':
      return handleCategoryProducts(chatId, params[0], parseInt(params[1]) || 0);

    // Cart
    case 'cart_add':
      return handleAddToCart(chatId, params[0], parseInt(params[1]) || 1);
    case 'cart_remove':
      return handleRemoveFromCart(chatId, params[0]);
    case 'cart_qty':
      return handleUpdateCartQty(chatId, params[0], parseInt(params[1]) || 0);
    case 'cart_clear':
      return handleClearCart(chatId);

    // Orders
    case 'order_confirm':
      return handleOrder(chatId);
    case 'order_do_confirm':
      return handleConfirmOrder(chatId);
    case 'order_cancel':
      return handleCancelOrder(chatId);
    case 'order_detail':
      return handleOrderDetail(chatId, params[0]);

    // Settings
    case 'settings':
      return handleSettingsToggle(chatId, params[0]);

    case 'noop':
      return; // Display-only button
  }
}

async function handleMenuAction(chatId: number, section: string): Promise<void> {
  if (GUARDED_MENU_SECTIONS.has(section) && !(await requireApprovedAccess(chatId))) return;

  switch (section) {
    case 'products': return handleProducts(chatId);
    case 'cart': return handleCart(chatId);
    case 'myorders': return handleMyOrders(chatId);
    case 'reorder': return handleReorder(chatId);
    case 'settings': return handleSettings(chatId);
    case 'help': return handleHelp(chatId);
  }
}

async function handleBackAction(chatId: number, target: string): Promise<void> {
  switch (target) {
    case 'main':
      await telegram.sendMessage(chatId, '🏪 <b>MegaHome Ulgurji</b>\n\nQuyidagi menyudan tanlang:', {
        replyMarkup: mainMenuKeyboard(),
      });
      break;
    case 'categories':
      if (!(await requireApprovedAccess(chatId))) return;
      return handleProducts(chatId);
  }
}
