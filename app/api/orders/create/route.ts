import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getAdminApp } from '@/lib/firebase-admin';

/**
 * Server-validated order creation.
 *
 * Why: prior to this route, clients called Firestore `addDoc` directly with a
 * client-computed totalPrice and full product snapshots. A user could tamper
 * with cart state in DevTools (`cartProducts[0].price = 1`) and pay 1 soʻm
 * for any item — Firestore rules only checked userUid ownership.
 *
 * This endpoint atomically, inside a Firestore transaction:
 *   1. Reads every referenced product
 *   2. Confirms stock >= requested quantity (else 409 + item list)
 *   3. Computes totalPrice from server-side prices
 *   4. Decrements each product's stock (reserve-on-create model)
 *   5. Creates the order doc with a server-side snapshot
 *
 * After the transaction commits it also logs stock movements (audit trail).
 * Caller must present a Firebase Bearer ID token.
 */

interface CartItemInput {
  productId: string;
  quantity: number;
}

type PaymentEntryMethod = 'naqd' | 'nasiya' | 'karta';
interface PaymentEntryInput {
  method: PaymentEntryMethod;
  amount: number;
  dueDate?: string; // ISO date string (server converts to Timestamp)
  note?: string;
}

interface TicketDiscountInput {
  type: 'pct' | 'abs';
  value: number;
}

interface RequestBody {
  items: CartItemInput[];
  clientName: string;
  clientPhone: string;
  deliveryAddress?: string;
  orderNote?: string;
  paymentMethod?: string;
  // When an admin places an order on behalf of a customer, the customer's uid
  // must be supplied here (caller must itself be admin — we verify below).
  targetUserUid?: string;
  // POS additions
  paymentBreakdown?: PaymentEntryInput[];
  ticketDiscount?: TicketDiscountInput;
  source?: 'pos' | 'web' | 'admin' | 'telegram';
  // Promo / discount code — validated + applied atomically inside the
  // same Firestore transaction that decrements stock. usedBy[uid] and
  // totalUsed counters increment in the same write so we never overshoot
  // maxUsesTotal or maxUsesPerUser under concurrent redemptions.
  promoCode?: string;
}

interface OrderBasketItem {
  id: string;
  title: string;
  price: string;
  costPrice?: number;
  category: string;
  subcategory?: string;
  description?: string;
  productImageUrl: { url: string; path: string }[];
  storageFileId?: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminApp = getAdminApp();

    // ── Idempotency guard ──
    // Without this, a flaky network retry from the POS or web checkout
    // would create the order twice — double stock decrement, double nasiya
    // entry, double charge. Caller passes a unique key per logical
    // transaction. We claim it via Admin SDK `create()` (atomic;
    // ALREADY_EXISTS on second call). On dup, we look up the original
    // order and return the same response shape so the client treats it
    // identically. Same pattern as Telegram webhook idempotency.
    const idemKey = req.headers.get('Idempotency-Key');
    let claimedIdemKey: string | null = null;
    if (idemKey) {
      const k = idemKey.trim();
      if (k.length < 8 || k.length > 128) {
        return NextResponse.json({ error: 'Invalid Idempotency-Key' }, { status: 400 });
      }
      try {
        await adminApp
          .firestore()
          .collection('idempotencyKeys')
          .doc(k)
          .create({ scope: 'orders/create', createdAt: admin.firestore.FieldValue.serverTimestamp() });
        claimedIdemKey = k;
      } catch (err) {
        const code = (err as { code?: number | string })?.code;
        if (code === 6 || code === 'already-exists') {
          // Duplicate retry — return a 200 with a flag. We don't reconstruct
          // the original order body; clients that need the orderId should
          // store it locally on first success.
          return NextResponse.json({ ok: true, dedup: true });
        }
        throw err;
      }
    }
    void claimedIdemKey;
    let callerUid: string;
    let callerIsAdmin = false;
    try {
      const token = authHeader.split('Bearer ')[1];
      const decoded = await adminApp.auth().verifyIdToken(token);
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const db = adminApp.firestore();

    // Look up caller role from Firestore (source of truth)
    const callerDoc = await db.collection('user').doc(callerUid).get();
    callerIsAdmin = callerDoc.exists && callerDoc.data()?.role === 'admin';

    // ── Input parse + validate ─────────────────────────
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { items, clientName, clientPhone, deliveryAddress, orderNote, paymentMethod, targetUserUid, paymentBreakdown, ticketDiscount, source, promoCode } = body;
    const promoCodeNormalized = typeof promoCode === 'string' ? promoCode.trim().toUpperCase() : '';

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items required' }, { status: 400 });
    }
    if (items.length > 500) {
      return NextResponse.json({ error: 'Too many items' }, { status: 400 });
    }
    if (typeof clientName !== 'string' || clientName.trim().length < 1) {
      return NextResponse.json({ error: 'clientName required' }, { status: 400 });
    }
    if (typeof clientPhone !== 'string' || clientPhone.trim().length < 4) {
      return NextResponse.json({ error: 'clientPhone required' }, { status: 400 });
    }

    // ── Validate ticket discount and payment breakdown (POS) ──
    let validatedDiscount: { type: 'pct' | 'abs'; value: number } | null = null;
    if (ticketDiscount) {
      const t = ticketDiscount.type;
      const v = Number(ticketDiscount.value);
      if (t !== 'pct' && t !== 'abs') {
        return NextResponse.json({ error: 'Invalid ticketDiscount.type' }, { status: 400 });
      }
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: 'Invalid ticketDiscount.value' }, { status: 400 });
      }
      if (t === 'pct' && v > 100) {
        return NextResponse.json({ error: 'Discount % cannot exceed 100' }, { status: 400 });
      }
      validatedDiscount = { type: t, value: v };
    }

    let validatedBreakdown: { method: PaymentEntryMethod; amount: number; dueDate?: Date; note?: string }[] | null = null;
    if (paymentBreakdown !== undefined) {
      if (!Array.isArray(paymentBreakdown) || paymentBreakdown.length === 0) {
        return NextResponse.json({ error: 'paymentBreakdown must be a non-empty array' }, { status: 400 });
      }
      if (paymentBreakdown.length > 5) {
        return NextResponse.json({ error: 'Too many payment entries' }, { status: 400 });
      }
      validatedBreakdown = [];
      for (const e of paymentBreakdown) {
        if (e.method !== 'naqd' && e.method !== 'nasiya' && e.method !== 'karta') {
          return NextResponse.json({ error: `Invalid payment method "${e.method}"` }, { status: 400 });
        }
        const amt = Number(e.amount);
        if (!Number.isFinite(amt) || amt <= 0) {
          return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
        }
        const due = e.dueDate ? new Date(e.dueDate) : undefined;
        if (due && Number.isNaN(due.getTime())) {
          return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 });
        }
        // Nasiya requires a known customer (targetUserUid for admin placements;
        // self-uid otherwise — we'll resolve orderUserUid below).
        if (e.method === 'nasiya' && !targetUserUid && !callerIsAdmin) {
          return NextResponse.json({ error: 'Nasiya requires customer identification' }, { status: 400 });
        }
        validatedBreakdown.push({
          method: e.method,
          amount: Math.round(amt),
          ...(due ? { dueDate: due } : {}),
          ...(e.note ? { note: String(e.note).slice(0, 200) } : {}),
        });
      }
    }

    const validatedSource: 'pos' | 'web' | 'admin' | 'telegram' =
      source === 'pos' || source === 'web' || source === 'admin' || source === 'telegram'
        ? source
        : 'web';

    // ── Pre-resolve the promo code doc id (transactions can't run queries) ──
    let promoCodeRefId: string | null = null;
    if (promoCodeNormalized) {
      const snap = await db.collection('promoCodes')
        .where('code', '==', promoCodeNormalized)
        .limit(1)
        .get();
      if (snap.empty) {
        return NextResponse.json({ error: 'Promo kod topilmadi' }, { status: 400 });
      }
      promoCodeRefId = snap.docs[0].id;
    }

    // Normalize and dedupe items (sum quantities for same productId)
    const merged = new Map<string, number>();
    for (const it of items) {
      if (typeof it?.productId !== 'string' || !it.productId) {
        return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });
      }
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 100_000) {
        return NextResponse.json({ error: `Invalid quantity for ${it.productId}` }, { status: 400 });
      }
      merged.set(it.productId, (merged.get(it.productId) ?? 0) + Math.floor(qty));
    }
    const normalizedItems = Array.from(merged.entries()).map(([productId, quantity]) => ({ productId, quantity }));

    // Ownership: customers can only create for themselves; admins may pass targetUserUid
    let orderUserUid = callerUid;
    if (targetUserUid && targetUserUid !== callerUid) {
      if (!callerIsAdmin) {
        return NextResponse.json({ error: 'Only admins can place orders for others' }, { status: 403 });
      }
      orderUserUid = targetUserUid;
    }

    // ── Transaction: validate stock + create order atomically ──
    type TxResult = {
      orderId: string;
      totalPrice: number;
      totalQuantity: number;
      basketItems: OrderBasketItem[];
      priceChanged: boolean;
      movements: Array<{
        productId: string;
        productTitle: string;
        quantity: number;
        stockBefore: number;
        stockAfter: number;
      }>;
    };

    let txResult: TxResult & { nasiyaIds: string[] };
    try {
      txResult = await db.runTransaction(async (tx) => {
        // READS FIRST (Firestore transaction requirement)
        const productRefs = normalizedItems.map((i) => db.collection('products').doc(i.productId));
        const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
        // Read promo code doc inside the transaction so cap checks
        // (totalUsed, usedBy[uid]) are atomic with the redemption write.
        const promoRef = promoCodeRefId ? db.collection('promoCodes').doc(promoCodeRefId) : null;
        const promoSnap = promoRef ? await tx.get(promoRef) : null;

        const stockErrors: Array<{ productId: string; title?: string; available: number; requested: number }> = [];
        const basketItems: OrderBasketItem[] = [];
        const movements: TxResult['movements'] = [];
        let totalPrice = 0;
        let totalQuantity = 0;
        const nasiyaIds: string[] = [];

        for (let i = 0; i < productSnaps.length; i++) {
          const snap = productSnaps[i];
          const { productId, quantity } = normalizedItems[i];

          if (!snap.exists) {
            stockErrors.push({ productId, available: 0, requested: quantity });
            continue;
          }
          const data = snap.data() ?? {};
          const available = typeof data.stock === 'number' ? data.stock : 0;
          if (available < quantity) {
            stockErrors.push({ productId, title: data.title, available, requested: quantity });
            continue;
          }

          const priceNum = Number(data.price);
          const linePrice = (Number.isFinite(priceNum) ? priceNum : 0) * quantity;
          totalPrice += linePrice;
          totalQuantity += quantity;

          basketItems.push({
            id: productId,
            title: String(data.title ?? ''),
            price: String(data.price ?? '0'),
            costPrice: typeof data.costPrice === 'number' ? data.costPrice : 0,
            category: String(data.category ?? ''),
            subcategory: data.subcategory ? String(data.subcategory) : undefined,
            description: data.description ? String(data.description) : undefined,
            productImageUrl: Array.isArray(data.productImageUrl) ? data.productImageUrl : [],
            storageFileId: data.storageFileId ? String(data.storageFileId) : undefined,
            quantity,
          });

          movements.push({
            productId,
            productTitle: String(data.title ?? ''),
            quantity,
            stockBefore: available,
            stockAfter: available - quantity,
          });
        }

        if (stockErrors.length > 0) {
          // Abort transaction by throwing; caught below.
          const err = new Error('Stock unavailable');
          (err as Error & { stockErrors?: typeof stockErrors }).stockErrors = stockErrors;
          throw err;
        }

        // ── Validate + apply promo code ──
        let promoDiscountAmount = 0;
        let promoCodeForOrder: string | undefined;
        if (promoSnap && promoRef) {
          if (!promoSnap.exists) {
            const err = new Error('Promo kod topilmadi');
            (err as Error & { promoError?: string }).promoError = 'not_found';
            throw err;
          }
          const promoData = promoSnap.data() ?? {};
          if (!promoData.active) {
            const err = new Error('Bu promo kod faol emas');
            (err as Error & { promoError?: string }).promoError = 'inactive';
            throw err;
          }
          const exp = promoData.expiresAt;
          // expiresAt is a Firestore Timestamp; toMillis() may not exist on plain objects
          const expMs = exp && typeof (exp as { toMillis?: () => number }).toMillis === 'function'
            ? (exp as { toMillis: () => number }).toMillis()
            : exp instanceof Date ? exp.getTime() : 0;
          if (expMs && expMs < Date.now()) {
            const err = new Error('Promo kod muddati tugagan');
            (err as Error & { promoError?: string }).promoError = 'expired';
            throw err;
          }
          const minOrder = Number(promoData.minOrderTotal) || 0;
          if (totalPrice < minOrder) {
            const err = new Error(`Buyurtma kamida ${minOrder} soʻm boʻlishi kerak`);
            (err as Error & { promoError?: string }).promoError = 'min_order';
            throw err;
          }
          const totalUsed = Number(promoData.totalUsed) || 0;
          const maxTotal = Number(promoData.maxUsesTotal) || 0;
          if (maxTotal > 0 && totalUsed >= maxTotal) {
            const err = new Error('Promo kod limiti tugagan');
            (err as Error & { promoError?: string }).promoError = 'sold_out';
            throw err;
          }
          const usedBy = (promoData.usedBy ?? {}) as Record<string, number>;
          const userUsed = Number(usedBy[orderUserUid]) || 0;
          const maxPerUser = Number(promoData.maxUsesPerUser) || 1;
          if (userUsed >= maxPerUser) {
            const err = new Error('Siz bu promo koddan allaqachon foydalangansiz');
            (err as Error & { promoError?: string }).promoError = 'already_used';
            throw err;
          }
          const ptype = promoData.type === 'abs' ? 'abs' : 'pct';
          const pval = Math.max(0, Number(promoData.value) || 0);
          promoDiscountAmount = ptype === 'pct'
            ? Math.round(totalPrice * (Math.min(100, pval) / 100))
            : Math.min(Math.round(pval), totalPrice);
          promoCodeForOrder = String(promoData.code || promoCodeNormalized);
        }

        // ── Compute net total after BOTH discounts ──
        // Promo applies first (customer earned), then ticket discount on the
        // remainder. We DO NOT apply ticketDiscount on the original gross
        // separately — that would over-discount when both are present.
        const afterPromo = totalPrice - promoDiscountAmount;
        let ticketDiscountAmount = 0;
        if (validatedDiscount) {
          ticketDiscountAmount = validatedDiscount.type === 'pct'
            ? Math.round(afterPromo * (validatedDiscount.value / 100))
            : Math.min(Math.round(validatedDiscount.value), afterPromo);
        }
        const discountAmount = promoDiscountAmount + ticketDiscountAmount;
        const netTotal = totalPrice - discountAmount;

        // ── Validate payment breakdown sum (POS) ──
        if (validatedBreakdown) {
          const sum = validatedBreakdown.reduce((s, e) => s + e.amount, 0);
          // Allow 1 UZS rounding tolerance
          if (Math.abs(sum - netTotal) > 1) {
            const err = new Error('Payment total mismatch');
            (err as Error & { paymentMismatch?: { expected: number; got: number } }).paymentMismatch = {
              expected: netTotal,
              got: sum,
            };
            throw err;
          }
        }

        // WRITES
        for (let i = 0; i < productRefs.length; i++) {
          tx.update(productRefs[i], { stock: movements[i].stockAfter });
        }

        const orderRef = db.collection('orders').doc();
        const orderTimestamp = new Date();
        const breakdownForOrder = validatedBreakdown
          ? validatedBreakdown.map((e) => ({
              method: e.method,
              amount: e.amount,
              ...(e.dueDate ? { dueDate: e.dueDate } : {}),
              ...(e.note ? { note: e.note } : {}),
            }))
          : undefined;
        // Resolve order-level paymentMethod summary from breakdown when not explicitly provided
        let resolvedPaymentMethod: string | undefined = paymentMethod;
        if (!resolvedPaymentMethod && validatedBreakdown && validatedBreakdown.length > 0) {
          const methods = new Set(validatedBreakdown.map((e) => e.method));
          if (methods.size > 1) resolvedPaymentMethod = 'aralash';
          else resolvedPaymentMethod = validatedBreakdown[0].method;
        }

        tx.set(orderRef, {
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          userUid: orderUserUid,
          date: orderTimestamp,
          status: 'yangi',
          basketItems,
          totalPrice,
          totalQuantity,
          stockReserved: true,
          source: validatedSource,
          ...(deliveryAddress?.trim() ? { deliveryAddress: deliveryAddress.trim() } : {}),
          ...(orderNote?.trim() ? { orderNote: orderNote.trim() } : {}),
          ...(resolvedPaymentMethod ? { paymentMethod: resolvedPaymentMethod } : {}),
          ...(breakdownForOrder ? { paymentBreakdown: breakdownForOrder } : {}),
          ...(validatedDiscount ? { ticketDiscount: validatedDiscount, discountAmount, netTotal } : {}),
          ...(promoCodeForOrder ? { promoCode: promoCodeForOrder, promoDiscountAmount } : {}),
        });

        // ── Atomically increment promo redemption counters ──
        if (promoRef) {
          tx.update(promoRef, {
            [`usedBy.${orderUserUid}`]: ((promoSnap?.data()?.usedBy ?? {})[orderUserUid] ?? 0) + 1,
            totalUsed: (Number(promoSnap?.data()?.totalUsed) || 0) + 1,
          });
        }

        // ── Write nasiya ledger entries for credit portions ──
        if (validatedBreakdown) {
          for (const e of validatedBreakdown) {
            if (e.method !== 'nasiya') continue;
            const nasiyaRef = db.collection('nasiya').doc();
            tx.set(nasiyaRef, {
              customerUid: orderUserUid,
              customerName: clientName.trim(),
              customerPhone: clientPhone.trim(),
              orderId: orderRef.id,
              amount: e.amount,
              paid: 0,
              remaining: e.amount,
              status: 'open',
              createdAt: orderTimestamp,
              ...(e.dueDate ? { dueDate: e.dueDate } : {}),
              ...(e.note ? { note: e.note } : {}),
            });
            nasiyaIds.push(nasiyaRef.id);
          }
        }

        // Detect price drift so the UI can warn the customer
        const clientTotalHint = Number(req.headers.get('X-Client-Total-Hint'));
        const priceChanged = Number.isFinite(clientTotalHint) && clientTotalHint > 0 && clientTotalHint !== totalPrice;

        return {
          orderId: orderRef.id,
          totalPrice,
          totalQuantity,
          basketItems,
          priceChanged,
          movements,
          nasiyaIds,
        };
      });
    } catch (err) {
      const stockErrors = (err as Error & { stockErrors?: unknown }).stockErrors;
      if (stockErrors) {
        return NextResponse.json({ error: 'Ombordagi mahsulot yetarli emas', stockErrors }, { status: 409 });
      }
      const paymentMismatch = (err as Error & { paymentMismatch?: { expected: number; got: number } }).paymentMismatch;
      if (paymentMismatch) {
        return NextResponse.json(
          { error: 'Toʻlov yigʻindisi summa bilan mos kelmadi', paymentMismatch },
          { status: 400 },
        );
      }
      const promoError = (err as Error & { promoError?: string }).promoError;
      if (promoError) {
        return NextResponse.json(
          { error: (err as Error).message || 'Promo kod xatosi', promoError },
          { status: 400 },
        );
      }
      console.error('Order create transaction failed:', err);
      return NextResponse.json({ error: 'Order creation failed' }, { status: 500 });
    }

    // ── Audit trail (post-commit; fire-and-forget but awaited as a batch) ──
    try {
      const ts = new Date();
      const writes = txResult.movements.map((m) =>
        db.collection('stockMovements').add({
          productId: m.productId,
          productTitle: m.productTitle,
          type: 'sotish',
          quantity: -m.quantity,
          stockBefore: m.stockBefore,
          stockAfter: m.stockAfter,
          reason: 'Buyurtma yaratildi',
          reference: txResult.orderId,
          timestamp: ts,
        }),
      );
      await Promise.all(writes);
    } catch (err) {
      console.error('stockMovement log failed (non-fatal):', err);
    }

    return NextResponse.json({
      ok: true,
      orderId: txResult.orderId,
      totalPrice: txResult.totalPrice,
      totalQuantity: txResult.totalQuantity,
      basketItems: txResult.basketItems,
      priceChanged: txResult.priceChanged,
      nasiyaIds: txResult.nasiyaIds,
    });
  } catch (err) {
    console.error('Order create route error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
