// Lightweight Telegram Bot API client — no external dependencies
import type { SendMessageParams, SendPhotoParams, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove } from './types';
import { pruneBlockedTelegramUser } from './admin-app';

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = () => `https://api.telegram.org/bot${BOT_TOKEN()}`;

/**
 * Telegram returns these error codes when a user has blocked the bot or the
 * chat is otherwise unreachable. We use them to prune dead chatIds from
 * `telegramUsers` so broadcasts don't keep burning quota on them.
 */
const BLOCKED_ERROR_CODES = new Set([403]);
const BLOCKED_ERROR_DESCRIPTIONS = [
  'bot was blocked',
  'user is deactivated',
  'chat not found',
  'PEER_ID_INVALID',
];

async function apiCall(
  method: string,
  body: Record<string, unknown>,
  opts: { chatIdForPrune?: number | string } = {},
) {
  const res = await fetch(`${API_BASE()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error [${method}]:`, data.error_code, data.description);
    // Auto-prune dead chats so broadcasts don't keep paying for them.
    if (opts.chatIdForPrune) {
      const desc = String(data.description ?? '').toLowerCase();
      const isBlocked =
        BLOCKED_ERROR_CODES.has(data.error_code) ||
        BLOCKED_ERROR_DESCRIPTIONS.some((s) => desc.includes(s.toLowerCase()));
      if (isBlocked) {
        // fire-and-forget — pruning is opportunistic
        void pruneBlockedTelegramUser(opts.chatIdForPrune);
      }
    }
  }
  return data;
}

export const telegram = {
  async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove;
      disablePreview?: boolean;
    }
  ) {
    const params: SendMessageParams = {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode ?? 'HTML',
      reply_markup: options?.replyMarkup,
      disable_web_page_preview: options?.disablePreview ?? true,
    };
    return apiCall('sendMessage', params as unknown as Record<string, unknown>, { chatIdForPrune: chatId });
  },

  async sendPhoto(
    chatId: number | string,
    photoUrl: string,
    caption?: string,
    replyMarkup?: InlineKeyboardMarkup
  ) {
    const params: SendPhotoParams = {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    };
    return apiCall('sendPhoto', params as unknown as Record<string, unknown>, { chatIdForPrune: chatId });
  },

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    return apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  },

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    replyMarkup?: InlineKeyboardMarkup
  ) {
    return apiCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
  },

  async setWebhook(url: string, secret: string) {
    return apiCall('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
    });
  },

  async deleteWebhook() {
    return apiCall('deleteWebhook', {});
  },

  async getMe() {
    const res = await fetch(`${API_BASE()}/getMe`);
    return res.json();
  },
};
