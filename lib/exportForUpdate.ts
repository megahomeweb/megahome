import * as XLSX from "xlsx";
import type { ProductT } from "@/lib/types";

export function exportProductsForUpdate(products: ProductT[], filename = "mahsulotlar_tahrirlash") {
  const data = products.map((p, i) => ({
    "ID (o'zgartirmang!)": p.id,
    "#": i + 1,
    "Nomi": p.title,
    "Kategoriya": p.category,
    "Subkategoriya": p.subcategory || "",
    "Sotish narxi": Number(p.price),
    "Tan narxi": p.costPrice || 0,
    "Ombor soni": typeof p.stock === "number" ? p.stock : 1,
    "Tavsif": p.description || "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 24 }, { wch: 5 }, { wch: 30 }, { wch: 18 },
    { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mahsulotlar");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
