import nodemailer from 'nodemailer';
import { getAdminApp } from '@/lib/firebase-admin';

/**
 * Send order-receipt email to admin Gmail.
 *
 * Hardened entry point. Previous version accepted client-supplied
 * `clientName / clientPhone / basketItems / totalPrice` in the body —
 * any authenticated user could spam the company Gmail with arbitrary
 * order content (free spam relay). Fix: accept only `{ orderId }`,
 * read the actual order from Firestore via Admin SDK, verify the caller
 * owns the order OR is admin/manager, and email the verified data.
 */

interface RequestBody {
  orderId: string;
}

interface BasketItemDoc {
  title?: string;
  quantity?: number;
}

export async function POST(req: Request) {
  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const adminApp = getAdminApp();
    let callerUid: string;
    try {
      const token = authHeader.split('Bearer ')[1];
      callerUid = (await adminApp.auth().verifyIdToken(token)).uid;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Body ──
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const orderId = String(body.orderId ?? '').trim();
    if (!orderId || orderId.length > 64) {
      return new Response(JSON.stringify({ error: 'orderId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = adminApp.firestore();

    // ── Authorization: caller is admin/manager OR owns the order ──
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const order = orderDoc.data() ?? {};

    let allowed = order.userUid === callerUid;
    if (!allowed) {
      const callerDoc = await db.collection('user').doc(callerUid).get();
      const role = callerDoc.exists ? callerDoc.data()?.role : null;
      allowed = role === 'admin' || role === 'manager';
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Build email from server-verified fields only ──
    const clientName = String(order.clientName ?? 'Mijoz');
    const clientPhone = String(order.clientPhone ?? '');
    const totalPrice = Number(order.totalPrice ?? 0);
    const totalQuantity = Number(order.totalQuantity ?? 0);
    const basketItems = Array.isArray(order.basketItems) ? (order.basketItems as BasketItemDoc[]) : [];
    const dateMs = order.date?.toMillis?.() ?? Date.now();

    const orderDetails = basketItems
      .map((item) => `- ${item.title ?? '?'} — ${item.quantity ?? 0} ta`)
      .join('\n');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const adminEmail = process.env.GMAIL_USER || 'megahomeweb@gmail.com';
    const mailOptions = {
      from: process.env.GMAIL_USER || adminEmail,
      to: adminEmail,
      subject: `Yangi buyurtma: ${clientName}`,
      text: [
        'Yangi buyurtma berildi! (mega ulgurji uchun)',
        '',
        'Buyurtma tafsilotlari:',
        `Order ID: ${orderId}`,
        `Ism: ${clientName}`,
        `Telefon: ${clientPhone}`,
        `Sana: ${new Date(dateMs).toLocaleString('uz-UZ')}`,
        '',
        'Mahsulotlar:',
        orderDetails,
        '',
        `Umumiy narx: $${totalPrice.toLocaleString('en-US')}`,
        `Umumiy miqdor: ${totalQuantity} ta`,
      ].join('\n'),
    };

    await transporter.sendMail(mailOptions);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[sendOrderEmail] failed:', error);
    return new Response(JSON.stringify({ error: 'Email yuborilmadi' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
