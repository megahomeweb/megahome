/**
 * Format a price value in USD with grouping and a trailing "$" suffix.
 *
 * The function name is kept as `formatUZS` (legacy) to avoid a
 * codebase-wide rename — the output is USD with the symbol on the right
 * (matches the existing UI convention "75 so'm" → "75$"). If the stored
 * value is still in soʻm and a real currency conversion is needed,
 * convert BEFORE calling this; `formatUZS` is presentation only.
 *
 * Examples:
 *   formatUZS(75)        → "75$"
 *   formatUZS(1500000)   → "1,500,000$"
 *   formatUZS("1500000") → "1,500,000$"
 *   formatUZS(0)         → "0$"
 */
export function formatUZS(price: string | number): string {
  const num = typeof price === 'string' ? Number(price) : price;
  if (isNaN(num)) return '0$';
  // Cents matter: the catalog stores fractional USD prices (52.58$) and
  // costs (51.58$). With maximumFractionDigits: 0 a 5.75$ profit rendered
  // as "6$" and a 513.25$ total as "513$" — misreporting money to the
  // operator. Whole amounts still render clean ("507$"), fractional ones
  // keep their cents ("5.75$").
  const formatted = new Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
  return `${formatted}$`;
}

/**
 * Format a price value as raw number with grouping (no currency prefix).
 * Useful when the currency label is rendered separately.
 * Examples:
 *   formatNumber(1500000) → "1,500,000"
 *   formatNumber("43")    → "43"
 */
export function formatNumber(price: string | number): string {
  const num = typeof price === 'string' ? Number(price) : price;
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}
