import * as admin from 'firebase-admin';

/**
 * Lazy initializer for the Firebase Admin SDK.
 *
 * `firestore.settings({ ignoreUndefinedProperties: true })` is critical:
 * without it, any tx.set / .add / .update that includes a field whose
 * value is `undefined` throws `Cannot use "undefined" as a Firestore value`.
 * The order-create transaction in app/api/orders/create/route.ts builds
 * basketItems whose optional fields (subcategory, description,
 * storageFileId) are explicitly `undefined` when the source product
 * lacks them — that was surfacing as the "Order creation failed" toast
 * in the POS NAQD flow. settings() must be called once, before the
 * first firestore() call, so we set it inside the same init block.
 */
export function getAdminApp() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    try {
      admin.firestore().settings({ ignoreUndefinedProperties: true });
    } catch (err) {
      // settings() throws if called twice — harmless in dev hot-reload.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[firebase-admin] firestore.settings() warning:', (err as Error).message);
      }
    }
  }
  return admin;
}
