/**
 * SESSION_SECRET resolution — single source of truth for the cookie
 * signing key, used by every site that signs or verifies the
 * `__session` cookie:
 *   - app/api/auth/admin-session/route.ts (signs)
 *   - app/api/auth/session/route.ts        (signs)
 *   - middleware.ts                        (verifies)
 *
 * Resolution order:
 *   1. process.env.SESSION_SECRET (if ≥32 chars) — REQUIRED for prod.
 *   2. Development-only derived default. Never used in production —
 *      production fails closed.
 *
 * Why fail closed in prod?
 * The previous derived default mixed the admin password into the HMAC
 * key, which meant anyone who learned the admin password could forge
 * admin cookies offline (no network round-trip, no rate limit). That's
 * a worse failure mode than a startup error: an operator who sees the
 * deployment refuse to start fixes their config; a leaked password
 * with a derived secret silently grants full admin take-over.
 *
 * Edge-runtime compatible: only string ops, no Node-only APIs.
 */
export function resolveSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 32) return explicit;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET env var is required in production (≥32 chars). Refusing to sign cookies with derived secret.',
    );
  }

  // Development-only derived default. Components:
  //   - A namespace constant (so a colliding deployment of unrelated
  //     code with the same project ID can't forge cookies for us).
  //   - The project ID (different per Firebase project).
  //   - A dev-only suffix that does NOT depend on the admin password,
  //     so leaking the dev password doesn't grant cookie-forging power.
  const namespace = 'megahome-ulgurji-session-v1-dev';
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'mega-ulgurji-1fccf';
  return `${namespace}::${projectId}::dev-fallback-not-for-production-use-32+chars`;
}

/**
 * Verify-side helper used by middleware. Mirrors resolveSessionSecret
 * but never throws — fail-closed verification (return null) is safer
 * than a 500 from the gate. The signers above can throw if they hit a
 * configuration the verifier could never accept.
 */
export function resolveSessionSecretSafe(): string | null {
  try {
    const s = resolveSessionSecret();
    return s && s.length >= 16 ? s : null;
  } catch {
    return null;
  }
}
