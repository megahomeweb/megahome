import * as XLSX from 'xlsx';
import { ProductT, CategoryI } from './types';

/**
 * Export a customer-facing price list as an Excel file.
 * Sheet 1: "Narx ro'yxati" — full product list sorted by category then name.
 * Sheet 2: "Kategoriyalar" — category summary with product count and price range.
 */
export function exportPriceList(products: ProductT[], categories: CategoryI[]) {
  if (products.length === 0) return;

  const today = new Date();
  const dateStr = today.toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '.');

  // ---------- Sheet 1: Narx ro'yxati ----------

  // Sort products by category, then by title within category
  const sorted = [...products].sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category, 'uz');
    if (catCmp !== 0) return catCmp;
    return a.title.localeCompare(b.title, 'uz');
  });

  // Build rows with a header title row and a blank spacer
  const priceRows: Record<string, string | number>[] = [];

  // Title row
  priceRows.push({
    '#': '',
    'Kategoriya': `MegaHome Ulgurji - Narx Ro'yxati`,
    'Mahsulot nomi': '',
    'Narx (USD)': '',
    'Omborda bor': dateStr,
  });

  // Empty spacer row
  priceRows.push({
    '#': '',
    'Kategoriya': '',
    'Mahsulot nomi': '',
    'Narx (USD)': '',
    'Omborda bor': '',
  });

  sorted.forEach((p, idx) => {
    const price = Math.round(Number(p.price));
    const stockVal = typeof p.stock === 'number' ? p.stock : null;
    const stockDisplay: string | number =
      stockVal === null ? 'Belgilanmagan' :
      stockVal === 0 ? 'Tugagan' :
      stockVal;

    priceRows.push({
      '#': idx + 1,
      'Kategoriya': p.category,
      'Mahsulot nomi': p.title,
      'Narx (USD)': price,
      'Omborda bor': stockDisplay,
    });
  });

  const ws1 = XLSX.utils.json_to_sheet(priceRows);

  // Column widths
  ws1['!cols'] = [
    { wch: 5 },   // #
    { wch: 22 },  // Kategoriya
    { wch: 40 },  // Mahsulot nomi
    { wch: 18 },  // Narx
    { wch: 14 },  // Omborda bor
  ];

  // ---------- Sheet 2: Kategoriyalar ----------

  // Build a map: category name -> array of prices
  const categoryPriceMap: Record<string, number[]> = {};
  for (const p of products) {
    const price = Number(p.price);
    if (!categoryPriceMap[p.category]) {
      categoryPriceMap[p.category] = [];
    }
    categoryPriceMap[p.category].push(price);
  }

  // Use the categories list for ordering; include only categories that have products
  const catNames = categories.map(c => c.name);
  // Also capture any category names in products that aren't in the categories list
  const extraCats = Object.keys(categoryPriceMap).filter(c => !catNames.includes(c));
  const orderedCats = [...catNames, ...extraCats].filter(c => categoryPriceMap[c]);

  const categoryRows = orderedCats.map((catName) => {
    const prices = categoryPriceMap[catName];
    const min = Math.round(Math.min(...prices));
    const max = Math.round(Math.max(...prices));
    const rangeStr = min === max ? formatNum(min) : `${formatNum(min)} - ${formatNum(max)}`;
    return {
      'Kategoriya': catName,
      'Mahsulotlar soni': prices.length,
      "Narx oralig'i (USD)": rangeStr,
    };
  });

  const ws2 = XLSX.utils.json_to_sheet(categoryRows);
  ws2['!cols'] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 28 },
  ];

  // ---------- Build workbook ----------

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Narx ro'yxati");
  XLSX.utils.book_append_sheet(wb, ws2, 'Kategoriyalar');

  const fileDate = today.toISOString().slice(0, 10).replace(/-/g, '_');
  XLSX.writeFile(wb, `MegaHome_Narx_Royxati_${fileDate}.xlsx`);
}

/** Format a number with comma grouping (e.g. 1,500,000) */
function formatNum(n: number): string {
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(n);
}
