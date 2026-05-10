// Telegram channel auto-posting — sends to TELEGRAM_CHANNEL_ID
import { telegram } from './bot';
import {
  formatNewProductPost,
  formatPriceDropPost,
  formatBackInStockPost,
  escapeHtml,
} from './formatter';

const getChannelId = () => process.env.TELEGRAM_CHANNEL_ID;

export async function postNewProduct(product: {
  id: string;
  title: string;
  price: string;
  category: string;
  description?: string;
  productImageUrl?: { url: string }[];
}): Promise<void> {
  const channelId = getChannelId();
  if (!channelId) return;

  try {
    const imageUrl = product.productImageUrl?.[0]?.url;
    const text = formatNewProductPost(product);

    if (imageUrl) {
      await telegram.sendPhoto(channelId, imageUrl, text);
    } else {
      await telegram.sendMessage(channelId, text);
    }
  } catch (error) {
    console.error('Telegram channel post (new product) error:', error);
  }
}

export async function postPriceDrop(
  product: { id: string; title: string; productImageUrl?: { url: string }[] },
  oldPrice: number,
  newPrice: number
): Promise<void> {
  const channelId = getChannelId();
  if (!channelId) return;

  try {
    const text = formatPriceDropPost(product, oldPrice, newPrice);
    const imageUrl = product.productImageUrl?.[0]?.url;

    if (imageUrl) {
      await telegram.sendPhoto(channelId, imageUrl, text);
    } else {
      await telegram.sendMessage(channelId, text);
    }
  } catch (error) {
    console.error('Telegram channel post (price drop) error:', error);
  }
}

export async function postBackInStock(product: {
  id: string;
  title: string;
  price: string;
  stock?: number;
  productImageUrl?: { url: string }[];
}): Promise<void> {
  const channelId = getChannelId();
  if (!channelId) return;

  try {
    const text = formatBackInStockPost(product);
    const imageUrl = product.productImageUrl?.[0]?.url;

    if (imageUrl) {
      await telegram.sendPhoto(channelId, imageUrl, text);
    } else {
      await telegram.sendMessage(channelId, text);
    }
  } catch (error) {
    console.error('Telegram channel post (back in stock) error:', error);
  }
}

export async function postWeeklyBestsellers(products: {
  title: string;
  totalSold: number;
  price: string;
}[]): Promise<void> {
  const channelId = getChannelId();
  if (!channelId || products.length === 0) return;

  try {
    const lines = [
      '🏆 <b>HAFTALIK ENG KO\'P SOTILGANLAR</b>',
      '',
    ];

    products.slice(0, 5).forEach((p, i) => {
      const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
      const price = Number(p.price).toLocaleString('en-US') + '$';
      lines.push(`${medal} <b>${escapeHtml(p.title)}</b>`);
      lines.push(`   💰 ${price} | 📦 ${p.totalSold} ta sotildi`);
      lines.push('');
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://megahome.app';
    lines.push(`🛒 Buyurtma berish: ${siteUrl}`);

    await telegram.sendMessage(channelId, lines.join('\n'));
  } catch (error) {
    console.error('Telegram channel post (bestsellers) error:', error);
  }
}
