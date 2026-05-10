import { telegram } from '../bot';
import { getDb } from '../admin-app';
import { formatProductCard, escapeHtml } from '../formatter';
import { categoryKeyboard, productListKeyboard, productDetailKeyboard } from '../keyboards';

const PRODUCTS_PER_PAGE = 5;
// Hard cap on products fetched per category view — keeps Telegram response
// times predictable and caps Firestore reads even if a category has
// thousands of items. A true cursor-based paginator would need the seek key
// in callback_data; this bound is a pragmatic middle ground.
const MAX_CATEGORY_PRODUCTS = 50;

export async function handleProducts(chatId: number): Promise<void> {
  const db = getDb();
  const snap = await db.collection('categories').get();
  const categories = snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name || '',
  }));

  if (categories.length === 0) {
    await telegram.sendMessage(chatId, '📦 Hozircha kategoriyalar mavjud emas.');
    return;
  }

  await telegram.sendMessage(
    chatId,
    '📂 <b>Kategoriyalar</b>\n\nKategoriyani tanlang:',
    { replyMarkup: categoryKeyboard(categories) }
  );
}

export async function handleCategoryProducts(chatId: number, categoryId: string, page: number): Promise<void> {
  const db = getDb();

  // Get category name
  const catDoc = await db.collection('categories').doc(categoryId).get();
  const categoryName = catDoc.exists ? catDoc.data()?.name || '' : '';

  // Get products in category. Bounded fetch keeps Telegram latency + read
  // cost predictable; no orderBy so we don't require a composite index.
  const snap = await db.collection('products')
    .where('category', '==', categoryName)
    .limit(MAX_CATEGORY_PRODUCTS)
    .get();

  const products = snap.docs.map((d) => ({
    id: d.id,
    title: d.data().title || '',
    price: d.data().price || '0',
    stock: d.data().stock ?? 0,
  }));

  if (products.length === 0) {
    await telegram.sendMessage(
      chatId,
      `📂 <b>${escapeHtml(categoryName)}</b>\n\nBu kategoriyada mahsulot yo'q.`
    );
    return;
  }

  const totalPages = Math.ceil(products.length / PRODUCTS_PER_PAGE);
  const pageProducts = products.slice(page * PRODUCTS_PER_PAGE, (page + 1) * PRODUCTS_PER_PAGE);

  const lines = [`📂 <b>${escapeHtml(categoryName)}</b> (${products.length} ta)`, ''];
  pageProducts.forEach((p, i) => {
    const stockText = p.stock > 0 ? `✅ ${p.stock} ta` : '🔴 Tugagan';
    const num = page * PRODUCTS_PER_PAGE + i + 1;
    lines.push(`${num}. <b>${escapeHtml(p.title)}</b>`);
    lines.push(`   💰 ${formatPriceInline(p.price)}  | ${stockText}`);
  });

  await telegram.sendMessage(chatId, lines.join('\n'), {
    replyMarkup: productListKeyboard(pageProducts, categoryId, page, totalPages),
  });
}

export async function handleProductDetail(chatId: number, productId: string): Promise<void> {
  const db = getDb();
  const doc = await db.collection('products').doc(productId).get();

  if (!doc.exists) {
    await telegram.sendMessage(chatId, '❌ Mahsulot topilmadi.');
    return;
  }

  const data = doc.data()!;
  const product = {
    title: data.title || '',
    price: data.price || '0',
    description: data.description || '',
    category: data.category || '',
    stock: data.stock ?? 0,
  };

  const inStock = product.stock > 0;
  const text = formatProductCard(product);

  // Try to send with image
  const imageUrl = data.productImageUrl?.[0]?.url;
  if (imageUrl) {
    try {
      await telegram.sendPhoto(chatId, imageUrl, text, productDetailKeyboard(productId, inStock));
      return;
    } catch {
      // Fall back to text-only if image fails
    }
  }

  await telegram.sendMessage(chatId, text, {
    replyMarkup: productDetailKeyboard(productId, inStock),
  });
}

function formatPriceInline(price: string): string {
  return Number(price).toLocaleString('en-US') + '$';
}
