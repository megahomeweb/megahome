/**
 * Phone number utilities — single source of truth for normalization,
 * formatting, and de-duplication.
 *
 * Why: customer phone numbers enter the system from at least four
 * surfaces — admin-typed POS, customer signup form, Telegram
 * /start handler, and Excel imports — each with its own format
 * (`+998 (90) 123-45-67`, `+998901234567`, `998901234567`,
 * `90 123 45 67`). Without a canonical form, the same person shows up
 * as multiple "customers" on the rankings page and pre-signup vs
 * post-signup orders never merge.
 */

/**
 * Reduce a phone string to a canonical key suitable for deduping.
 *
 * Strategy:
 *   - Strip every non-digit (drops `+`, spaces, parens, dashes).
 *   - Strip a leading `998` country code (Uzbekistan) if present.
 *   - Take the LAST 9 digits — Uzbek mobiles are 9 digits after +998.
 *
 * Returns:
 *   - The 9-digit national number, e.g. "901234567"
 *   - `''` if the input has fewer than 7 digits (treat as unusable)
 *
 * Examples:
 *   canonicalPhone('+998 (90) 123-45-67') → '901234567'
 *   canonicalPhone('+998901234567')        → '901234567'
 *   canonicalPhone('901234567')            → '901234567'
 *   canonicalPhone('+1 555 123 4567')      → '5551234567' (10 digits, returned as-is when no 998 prefix)
 *   canonicalPhone('')                     → ''
 *   canonicalPhone('garbage')              → ''
 *
 * Notes:
 *   - We don't enforce +998 — international customers exist. The
 *     primary use case is dedupe within the same country, so consistent
 *     handling matters more than strict country gating.
 *   - For a strictly-Uzbek validation, see `isValidUzPhone`.
 */
export function canonicalPhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = String(input).replace(/\D/g, "");
  if (digits.length < 7) return "";
  // Strip Uzbekistan country code if present at the start so
  // '+998 90 123 45 67' and '90 123 45 67' collapse to the same key.
  if (digits.length === 12 && digits.startsWith("998")) {
    return digits.slice(3);
  }
  if (digits.length === 9) return digits;
  // Fallback: trim to last 9 (Uzbek mobile length). For non-Uzbek
  // numbers the caller can choose to use the full digit string.
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

/** Whether a phone is a valid 9-digit Uzbek mobile (after +998). */
export function isValidUzPhone(input: string | null | undefined): boolean {
  return canonicalPhone(input).length === 9;
}

/**
 * Pretty-print an Uzbek phone for display: `+998 90 123-45-67`.
 * Falls back to the original string if it can't be canonicalized.
 */
export function formatUzPhone(input: string | null | undefined): string {
  const canon = canonicalPhone(input);
  if (canon.length !== 9) return String(input ?? "").trim();
  // 90 123-45-67 → split as 2-3-2-2
  const [a, b, c, d] = [
    canon.slice(0, 2),
    canon.slice(2, 5),
    canon.slice(5, 7),
    canon.slice(7, 9),
  ];
  return `+998 ${a} ${b}-${c}-${d}`;
}
