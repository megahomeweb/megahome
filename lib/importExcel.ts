import * as XLSX from 'xlsx';
import { CategoryI } from './types';

export interface ParsedProduct {
  title: string;
  category: string;
  subcategory: string;
  price: string;
  costPrice: number;
  stock: number;
  description: string;
  errors: string[];
}

export function generateProductTemplate(categories: CategoryI[]) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Product template with headers and example
  const productHeaders = ['Nomi', 'Kategoriya', 'Subkategoriya', 'Sotish narxi', 'Tan narxi', 'Ombor soni', 'Tavsif'];
  const exampleRow = [
    categories[0]?.name ? `Misol: ${categories[0].name} mahsuloti` : 'Misol mahsulot',
    categories[0]?.name || 'Kategoriya nomi',
    categories[0]?.subcategory?.[0] || '',
    '50000',
    '35000',
    '100',
    'Mahsulot tavsifi',
  ];
  const ws1 = XLSX.utils.aoa_to_sheet([productHeaders, exampleRow]);
  ws1['!cols'] = [
    { wch: 30 }, { wch: 20 }, { wch: 20 },
    { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Mahsulotlar');

  // Sheet 2: Available categories reference
  const catHeaders = ['Kategoriya', 'Subkategoriyalar'];
  const catRows = categories.map((cat) => [
    cat.name,
    cat.subcategory?.join(', ') || '—',
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows]);
  ws2['!cols'] = [{ wch: 25 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Kategoriyalar (malumot)');

  XLSX.writeFile(wb, 'mahsulotlar_shablon.xlsx');
}

// Maps common column name variations (Uzbek, English, Russian) to canonical keys
const COLUMN_MAP: Record<string, string> = {
  // Title
  'nomi': 'title', 'nomi ': 'title', 'nom': 'title',
  'name': 'title', 'title': 'title', 'product': 'title', 'product name': 'title',
  'mahsulot': 'title', 'mahsulot nomi': 'title',
  'наименование': 'title', 'название': 'title', 'товар': 'title',
  // Category
  'kategoriya': 'category', 'category': 'category', 'kategoriya nomi': 'category',
  'turi': 'category', 'type': 'category',
  'категория': 'category',
  // Subcategory
  'subkategoriya': 'subcategory', 'subcategory': 'subcategory', 'sub category': 'subcategory',
  'sub kategoriya': 'subcategory',
  'подкатегория': 'subcategory',
  // Selling price
  'sotish narxi': 'price', 'narxi': 'price', 'narx': 'price',
  'price': 'price', 'selling price': 'price', 'sell price': 'price',
  'цена': 'price', 'цена продажи': 'price',
  // Cost price
  'tan narxi': 'costPrice', 'kelish narxi': 'costPrice', 'cost': 'costPrice',
  'cost price': 'costPrice', 'purchase price': 'costPrice',
  'себестоимость': 'costPrice',
  // Stock
  'ombor soni': 'stock', 'ombor': 'stock', 'soni': 'stock',
  'stock': 'stock', 'quantity': 'stock', 'qty': 'stock',
  'остаток': 'stock', 'количество': 'stock',
  // Description
  'tavsif': 'description', 'tavsifi': 'description',
  'description': 'description', 'desc': 'description',
  'описание': 'description',
};

function mapColumnKey(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  return COLUMN_MAP[normalized] || null;
}

/**
 * Normalize a user-entered category / subcategory name so we compare values
 * that may differ only by case, surrounding whitespace, collapsed interior
 * whitespace, or Unicode composition form.
 */
function normalizeLookup(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function parseProductsFromFile(file: File, categories: CategoryI[]): Promise<ParsedProduct[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        if (rows.length === 0) { resolve([]); return; }

        // Build column mapping from actual headers
        const sampleRow = rows[0];
        const headerMap: Record<string, string> = {};
        for (const key of Object.keys(sampleRow)) {
          const mapped = mapColumnKey(key);
          if (mapped) headerMap[key] = mapped;
        }

        const get = (row: Record<string, unknown>, canonical: string): string => {
          for (const [original, mapped] of Object.entries(headerMap)) {
            if (mapped === canonical && row[original] !== undefined) return String(row[original]).trim();
          }
          return '';
        };

        // Build a lookup map once: normalized-name -> canonical Category
        const categoryLookup = new Map<string, CategoryI>();
        for (const c of categories) {
          if (c?.name) categoryLookup.set(normalizeLookup(c.name), c);
        }

        const products: ParsedProduct[] = rows.map((row) => {
          const errors: string[] = [];
          const title = get(row, 'title');
          const rawCategory = get(row, 'category');
          const rawSubcategory = get(row, 'subcategory');
          const price = get(row, 'price') || '0';
          const costPrice = Number(get(row, 'costPrice') || 0);
          const rawStock = get(row, 'stock');
          const stock = rawStock === '' ? 1 : Number(rawStock);
          const description = get(row, 'description');

          // Resolve to the canonical category name (stored in Firestore) so
          // imported products correctly link to the existing category instead
          // of being filed under a lower-case or whitespace-bent duplicate.
          const matchedCategory = rawCategory
            ? categoryLookup.get(normalizeLookup(rawCategory))
            : undefined;
          const category = matchedCategory?.name ?? rawCategory;

          let subcategory = rawSubcategory;
          if (rawSubcategory && matchedCategory?.subcategory?.length) {
            const subLookup = new Map<string, string>();
            for (const s of matchedCategory.subcategory) subLookup.set(normalizeLookup(s), s);
            const canonicalSub = subLookup.get(normalizeLookup(rawSubcategory));
            if (canonicalSub) subcategory = canonicalSub;
          }

          if (!title) errors.push('Nomi kiritilmagan');
          if (!rawCategory) errors.push('Kategoriya kiritilmagan');
          else if (!matchedCategory) errors.push(`"${rawCategory}" kategoriyasi mavjud emas`);
          if (!price || isNaN(Number(price)) || Number(price) <= 0) errors.push("Narx noto'g'ri");
          if (isNaN(costPrice) || costPrice < 0) errors.push("Tan narx noto'g'ri");
          if (isNaN(stock) || stock < 0) errors.push("Ombor soni noto'g'ri");

          if (rawSubcategory && matchedCategory?.subcategory?.length) {
            const subNames = matchedCategory.subcategory.map(normalizeLookup);
            if (!subNames.includes(normalizeLookup(rawSubcategory))) {
              errors.push(`"${rawSubcategory}" subkategoriyasi mavjud emas`);
            }
          }

          return { title, category, subcategory, price, costPrice, stock, description, errors };
        }).filter((p) => p.title);

        resolve(products);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export interface CustomerExportData {
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  totalProfit: number;
  lastOrderDate: number;
}

export function exportCustomersToExcel(customers: CustomerExportData[], filename = 'mijozlar') {
  const rows = customers.map((c, i) => ({
    '#': i + 1,
    'Ism': c.name,
    'Telefon': c.phone,
    'Buyurtmalar soni': c.totalOrders,
    "Jami xarid (so'm)": c.totalSpent,
    "Foyda (so'm)": c.totalProfit,
    'Oxirgi buyurtma': c.lastOrderDate
      ? new Date(c.lastOrderDate).toLocaleDateString('uz-UZ')
      : '—',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 }, { wch: 25 }, { wch: 18 },
    { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mijozlar');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
