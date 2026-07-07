/**
 * Money rules for the MegaHome catalog (USD).
 *
 * WHOLE-DOLLAR POLICY (owner's rule): selling prices and cost prices are
 * stored and entered as whole dollars — 34, 45 — never 34.57. Every
 * write boundary (product forms, import, POS, kirim, API) normalizes
 * through toWholeMoney().
 *
 * roundMoney (cents) still exists for AGGREGATE math safety: it never
 * floors, because flooring an already-stored fractional price is exactly
 * the bug where a 12$ expected profit collapsed to 5.75$ (every POS line
 * silently floored 52.58 → 52 and the margin evaporated). Any legacy
 * fractional value passes through computations honestly instead of being
 * corrupted twice.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Normalize a money value to WHOLE dollars (half-up). Write-boundary rule. */
export function toWholeMoney(n: number | string): number {
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}
