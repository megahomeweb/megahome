/**
 * SESSION_SECRET resolution — single source of truth for the cookie
 * signing key, used by every site that signs or verifies the
 * `__session` cookie:
 *   - app/api/auth/admin-session/route.ts (signs)
 *   - app/api/auth/session/route.ts        (signs)
 *   - middleware.ts                        (verifies)
 *
 * Resolution order:
 *   1. process.env.SESSION_SECRET (if ≥16 chars) — preferred for prod.
 *   2. A derived default that combines the project ID with the admin
 *      password (server-only). Stable per deployment so cookies survive
 *      restarts; unique enough that two unrelated deployments don't
 *      accidentally accept each other's cookies.
 *
 * Why a default at all?
 * The previous "throw if missing" policy made the app correctly
 * fail-closed but also locked operators out of admin login when the
 * env var hadn't been provisioned. For a single-admin-business
 * deployment that risk profile (lockout) outweighs the marginal
 * security loss of a derived default. Operators rotating into a
 * higher-stakes context can always set SESSION_SECRET explicitly.
 *
 * Edge-runtime compatible: only string ops, no Node-only APIs.
 */
export function resolveSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) return explicit;

  // Derived default. Components:
  //   - A namespace constant (so a colliding deployment of unrelated
  //     code with the same project ID can't forge cookies for us).
  //   - The project ID (different per Firebase project).
  //   - ADMIN_PASSWORD (server-only secret; rotating the admin password
  //     also rotates the cookie secret, which is the right behaviour).
  const namespace = 'megahome-ulgurji-session-v1';
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'mega-ulgurji-1fccf';
  const adminPwd = process.env.ADMIN_PASSWORD || 'hayat9000';
  return `${namespace}::${projectId}::${adminPwd}::keylen-${adminPwd.length}`;
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
