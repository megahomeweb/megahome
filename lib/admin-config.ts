// Hardcoded admin identity. Per business requirement: exactly one admin
// account, the email is fixed, and access is gated by THIS email — not by
// the `role` field in the Firestore user doc (which is treated as a hint,
// not a security boundary). This means even if someone tampers with their
// own user doc to set role='admin', they won't pass any access check.
//
// Override via env vars in production if you ever need to rotate. The
// password env var must be SERVER-ONLY (no NEXT_PUBLIC_ prefix) so it
// never ships in the client bundle.
export const ADMIN_EMAIL = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'hayatabdulloh@gmail.com'
).toLowerCase();

// Server-only password constant. Read by /api/auth/admin-session only.
// Never imported from a client file — keep this isolated to API route code.
export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'hayat9000';
}

// Helper: case-insensitive admin email check.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL;
}
