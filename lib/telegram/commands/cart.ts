import { telegram } from '../bot';
import { getDb } from '../admin-app';
import { formatCartSummary } from '../formatter';
import { cartKeyboard, emptyCartKeyboard } from '../keyboards';
import type { CartItem } from '../types';

/**
 * Telegram-bot cart storage.
 *
 * Lives in Firestore under `telegramCarts/{chatId}` because Vercel spins
 * each bot request up in a fresh serverless instance — a module-level
 * `Map` (the previous implementation) lost every cart on cold start,
 * silently breaking the /products → /cart → /order flow in production.
 *
 * Docs are keyed by chatId (stringified) for O(1) reads/writes with no
 * index required. Default-deny rules protect the collection; Admin SDK
 * bypasses them for every function in this file.
 */

function cartRef(chatId: number) {
  return getDb().collection('telegramCarts').doc(String(chatId));
}

export async function getCart(chatId: number): Promise<CartItem[]> {
  const snap = await cartRef(chatId).get();
  return (snap.exists ? (snap.data()?.items as CartItem[] | undefined) : undefined) ?? [];
}

/**
 * Atomic cart mutation. Wraps a read-modify-write in a Firestore transaction
 * so concurrent ➕/➖ taps don't lose increments. Without this, a user
 * double-tapping the +1 button would race the first round-trip — the second
 * read sees the pre-first-write state and one increment is lost on commit.
 */
async function mutateCart(
  chatId: number,
  mutate: (items: CartItem[]) => CartItem[] | Promise<CartItem[]>,
): Promise<CartItem[]> {
  const db = getDb();
  const ref = cartRef(chatId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const items = (snap.exists ? (snap.data()?.items as CartItem[] | undefined) : undefined) ?? [];
    const next = await Promise.resolve(mutate(items));
    if (next.length === 0) {
      tx.delete(ref);
    } else {
      tx.set(ref, { items: next, updatedAt: new Date() });
    }
    return next;
  });
}

export async function handleCart(chatId: number, preloadedItems?: CartItem[]): Promise<void> {
  // Callers that just wrote the cart (remove / update qty) pass the new
  // items in so we skip a redundant Firestore read on every ➕/➖ tap.
  const items = preloadedItems ?? (await getCart(chatId));
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const text = formatCartSummary(items, total);

  if (items.length === 0) {
    await telegram.sendMessage(chatId, text, { replyMarkup: emptyCartKeyboard() });
  } else {
    await telegram.sendMessage(chatId, text, { replyMarkup: cartKeyboard(items) });
  }
}

export async function handleAddToCart(chatId: number, productId: string, quantity: number): Promise<void> {
  const db = getDb();
  const doc = await db.collection('products').doc(productId).get();

  if (!doc.exists) {
    await telegram.sendMessage(chatId, '❌ Mahsulot topilmadi.');
    return;
  }

  const data = doc.data()!;
  const stock = (data.stock ?? 0) as number;
  if (stock <= 0) {
    await telegram.sendMessage(chatId, '🔴 Bu mahsulot tugagan.');
    return;
  }

  let exceeded: number | null = null;
  await mutateCart(chatId, (items) => {
    const existing = items.find((i) => i.productId === productId);
    if (existing) {
      const newQty = existing.quantity + quantity;
      if (newQty > stock) {
        exceeded = stock;
        return items; // unchanged
      }
      return items.map((i) =>
        i.productId === productId ? { ...i, quantity: newQty } : i,
      );
    }
    if (quantity > stock) {
      exceeded = stock;
      return items;
    }
    return [
      ...items,
      {
        productId,
        title: data.title || '',
        price: Number(data.price) || 0,
        quantity,
      },
    ];
  });

  if (exceeded !== null) {
    await telegram.sendMessage(chatId, `⚠️ Stokda faqat ${exceeded} ta mavjud.`);
    return;
  }

  await telegram.sendMessage(
    chatId,
    `✅ <b>${data.title}</b> savatchaga qo'shildi!\n\n🛒 /cart — Savatchani ko'rish`,
  );
}

export async function handleRemoveFromCart(chatId: number, productId: string, _currentItems?: CartItem[]): Promise<void> {
  // _currentItems param kept for API compat but transaction always re-reads
  // for correctness under concurrent writes.
  void _currentItems;
  const items = await mutateCart(chatId, (curr) => curr.filter((i) => i.productId !== productId));
  await handleCart(chatId, items);
}

export async function handleUpdateCartQty(chatId: number, productId: string, delta: number): Promise<void> {
  const db = getDb();
  // Read live stock outside the transaction — products collection isn't part
  // of the cart-doc transaction boundary, just a constraint check.
  const productDoc = await db.collection('products').doc(productId).get();
  const stock = productDoc.exists ? ((productDoc.data()?.stock ?? 0) as number) : 0;

  let exceeded: number | null = null;
  let removed = false;

  const next = await mutateCart(chatId, (items) => {
    const item = items.find((i) => i.productId === productId);
    if (!item) return items;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      removed = true;
      return items.filter((i) => i.productId !== productId);
    }
    if (newQty > stock) {
      exceeded = stock;
      return items;
    }
    return items.map((i) => (i.productId === productId ? { ...i, quantity: newQty } : i));
  });

  if (exceeded !== null) {
    await telegram.sendMessage(chatId, `⚠️ Stokda faqat ${exceeded} ta mavjud.`);
    return;
  }
  void removed;
  await handleCart(chatId, next);
}

export async function handleClearCart(chatId: number): Promise<void> {
  await cartRef(chatId).delete().catch(() => {});
  await telegram.sendMessage(chatId, '🗑 Savatcha tozalandi.', {
    replyMarkup: emptyCartKeyboard(),
  });
}

/** Clear cart externally (called by order confirmation). */
export async function clearCart(chatId: number): Promise<void> {
  await cartRef(chatId).delete().catch(() => {});
}
