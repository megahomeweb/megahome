/**
 * Label printer — generates an A4 print sheet with multiple product
 * stickers (Code 128 barcode + name + price) sized to the chosen template.
 *
 * Architecture: produces a self-contained HTML document with JsBarcode
 * loaded from CDN (no npm dependency). When the document loads, the
 * client-side script renders real scannable Code 128 barcodes onto each
 * <svg class="barcode"> element. Then `window.print()` fires.
 *
 * Templates are millimetre dimensions (label_w × label_h). The grid auto-
 * fills the printable A4 area for fast batch printing.
 */

export interface LabelTemplate {
  id: string;
  name: string;
  /** Width in mm */
  widthMm: number;
  /** Height in mm */
  heightMm: number;
  /** Show price on label (default true) */
  showPrice?: boolean;
  /** Show SKU/code text below barcode (default true) */
  showSku?: boolean;
}

export interface LabelItem {
  productId: string;
  title: string;
  sku: string;
  /** Code 128 barcode value (alphanumeric). Falls back to SKU. */
  barcode?: string;
  priceUZS: number;
  /** How many copies of this label to print */
  amount: number;
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
  { id: "40x30", name: "Etiketka 40 × 30 mm", widthMm: 40, heightMm: 30 },
  { id: "50x30", name: "Etiketka 50 × 30 mm", widthMm: 50, heightMm: 30 },
  { id: "30x20", name: "Etiketka 30 × 20 mm", widthMm: 30, heightMm: 20, showPrice: false },
  { id: "58x40", name: "Etiketka 58 × 40 mm", widthMm: 58, heightMm: 40 },
  { id: "100x50", name: "Etiketka 100 × 50 mm", widthMm: 100, heightMm: 50 },
];

const escapeHtml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] || c);

const fmtUZS = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n)).replace(/,/g, " ") + " soʻm";

export function printLabels(items: LabelItem[], template: LabelTemplate, opts: { storeName?: string } = {}) {
  const storeName = opts.storeName || "MEGAHOME ULGURJI";

  // Expand each item by `amount` so the grid contains one cell per copy.
  const expanded: LabelItem[] = [];
  for (const it of items) {
    const n = Math.max(0, Math.floor(it.amount));
    for (let i = 0; i < n; i++) expanded.push(it);
  }
  if (expanded.length === 0) return;

  const fontSizeName = template.heightMm <= 20 ? 7 : template.heightMm <= 30 ? 8 : 10;
  const fontSizePrice = template.heightMm <= 20 ? 9 : template.heightMm <= 30 ? 11 : 14;
  const barcodeHeight = Math.max(18, template.heightMm * 0.45);

  const cells = expanded
    .map((it, idx) => {
      const code = (it.barcode || it.sku || it.productId).toString().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || "0";
      const showPrice = template.showPrice !== false;
      const showSku = template.showSku !== false;
      return `
        <div class="label">
          <div class="label-name">${escapeHtml(it.title)}</div>
          <div class="label-store">${escapeHtml(storeName)}</div>
          <svg class="barcode" id="bc${idx}" data-code="${escapeHtml(code)}"></svg>
          ${showSku ? `<div class="label-sku">${escapeHtml(code)}</div>` : ""}
          ${showPrice ? `<div class="label-price">${fmtUZS(it.priceUZS)}</div>` : ""}
        </div>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Etiketkalar — ${escapeHtml(storeName)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: 'Segoe UI', Tahoma, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 4mm; }
  .label-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, ${template.widthMm}mm);
    gap: 1mm;
    justify-content: start;
  }
  .label {
    width: ${template.widthMm}mm;
    height: ${template.heightMm}mm;
    border: 0.4mm solid #d1d5db;
    border-radius: 1mm;
    padding: 1mm 1.5mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .label-store {
    font-size: 5pt;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: #6b7280;
    text-transform: uppercase;
    line-height: 1;
    margin-bottom: 0.3mm;
  }
  .label-name {
    font-size: ${fontSizeName}pt;
    font-weight: 700;
    line-height: 1.05;
    text-align: center;
    margin-bottom: 0.5mm;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    max-height: ${fontSizeName * 2 + 2}pt;
    width: 100%;
  }
  .barcode {
    width: 100%;
    height: ${barcodeHeight}px;
    display: block;
  }
  .label-sku {
    font-family: 'Courier New', monospace;
    font-size: 6pt;
    color: #374151;
    line-height: 1;
    margin-top: 0.5mm;
  }
  .label-price {
    font-size: ${fontSizePrice}pt;
    font-weight: 800;
    line-height: 1;
    margin-top: auto;
  }
  .toolbar {
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -4mm -4mm 4mm;
    font-size: 12px;
  }
  .toolbar button {
    padding: 6px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-weight: 600;
  }
  .toolbar button.primary {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }
  .toolbar .count {
    margin-left: auto;
    color: #6b7280;
  }
  @page {
    size: A4;
    margin: 4mm;
  }
  @media print {
    .toolbar { display: none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">🖨 Chop etish</button>
    <button onclick="window.close()">Yopish</button>
    <span class="count">${expanded.length} ta etiketka · ${template.widthMm} × ${template.heightMm} mm</span>
  </div>
  <div class="label-grid">${cells}</div>
  <script>
    (function () {
      function render() {
        if (typeof JsBarcode !== 'function') {
          // CDN failed — fall back to text only (label still useful)
          return;
        }
        document.querySelectorAll('svg.barcode').forEach(function (svg) {
          var code = svg.getAttribute('data-code') || '0';
          try {
            JsBarcode(svg, code, {
              format: 'CODE128B',
              displayValue: false,
              margin: 0,
              height: ${Math.round(barcodeHeight * 0.7)},
              width: 1.4,
              background: '#ffffff',
              lineColor: '#000000',
            });
          } catch (e) {
            // Some product codes may be invalid for CODE128 — skip silently
          }
        });
      }
      if (document.readyState === 'complete') render();
      else window.addEventListener('load', render);
    })();
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
