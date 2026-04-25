"use client";

/**
 * Label maker — bito-style page for printing product price+barcode stickers.
 *
 * Flow:
 *   1. Pick organization (locked to MegaHome for v1).
 *   2. Pick label template (preset sizes 30×20, 40×30, 50×30, 58×40, 100×50 mm).
 *   3. Add products: Autocomplete = bulk-add all current stock; Import =
 *      Excel upload (re-uses generateProductTemplate format); manual add via
 *      search dropdown.
 *   4. Set Amount per row (= number of physical labels to print).
 *   5. Save → opens a print preview window with the full grid laid out for
 *      A4 paper, real Code 128 barcodes rendered via jsbarcode (CDN).
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import useProductStore from "@/store/useProductStore";
import { matchesSearch } from "@/lib/searchMatch";
import { formatUZS } from "@/lib/formatPrice";
import {
  printLabels,
  LABEL_TEMPLATES,
  type LabelItem,
  type LabelTemplate,
} from "@/lib/labels/printLabels";
import {
  parseProductsFromFile,
  type ParsedProduct,
} from "@/lib/importExcel";
import useCategoryStore from "@/store/useCategoryStore";
import type { ProductT } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Search, X, Plus, Copy, Trash2, Tag, Building2, Upload, Sparkles } from "lucide-react";
import PanelTitle from "@/components/admin/PanelTitle";

interface Row {
  productId: string;
  title: string;
  sku: string;
  barcode: string;
  price: number;
  amount: number;
}

export default function LabelMaker() {
  const { products, fetchProducts } = useProductStore();
  const { categories, fetchCategories } = useCategoryStore();

  useEffect(() => {
    const u1 = fetchProducts() as (() => void) | undefined;
    fetchCategories();
    return () => {
      if (typeof u1 === "function") u1();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [templateId, setTemplateId] = useState<string>(LABEL_TEMPLATES[1].id); // 40×30 default
  const [templateOpen, setTemplateOpen] = useState(false);
  const template: LabelTemplate =
    LABEL_TEMPLATES.find((t) => t.id === templateId) ?? LABEL_TEMPLATES[1];
  const templateMenuRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close template dropdown on outside click
  useEffect(() => {
    if (!templateOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!templateMenuRef.current?.contains(e.target as Node)) setTemplateOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [templateOpen]);

  const filteredProducts = useMemo(() => {
    if (search.trim().length < 1) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          matchesSearch(p.title, search) ||
          matchesSearch(p.category ?? "", search) ||
          matchesSearch(p.subcategory ?? "", search) ||
          (p.id ?? "").toLowerCase().includes(search.toLowerCase()),
      )
      .slice(0, 50);
  }, [products, search]);

  const totalLabels = rows.reduce((s, r) => s + Math.max(0, Math.floor(r.amount)), 0);

  const addRow = useCallback((p: ProductT) => {
    setRows((prev) => [
      ...prev,
      {
        productId: p.id,
        title: p.title,
        sku: (p.id || "").slice(0, 8).toUpperCase(),
        barcode: (p.id || "").slice(0, 8).toUpperCase(),
        price: Number(p.price) || 0,
        amount: 1,
      },
    ]);
  }, []);

  const setAmount = (productId: string, idx: number, raw: string) => {
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, amount: Number.isFinite(n) ? Math.max(0, n) : 0 } : r,
      ),
    );
  };

  const cloneRow = (idx: number) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, { ...prev[idx], amount: 1 });
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAutocomplete = useCallback(() => {
    if (products.length === 0) {
      toast.error("Mahsulotlar yuklanmagan");
      return;
    }
    // Confirm before destroying any work the admin may have done already.
    if (rows.length > 0) {
      if (!window.confirm(
        `Joriy ${rows.length} ta qator oʻchirilib, barcha omborda bor mahsulotlar bilan almashtiriladi. Davom etamizmi?`,
      )) return;
    }
    const inStock = products.filter(
      (p) => (typeof p.stock === "number" ? p.stock : 0) > 0,
    );
    if (inStock.length === 0) {
      if (!window.confirm("Omborda bor mahsulot topilmadi. Barcha mahsulotlar uchun etiketka qoʻshilsinmi?")) return;
    }
    const source = inStock.length > 0 ? inStock : products;
    const newRows: Row[] = source.map((p) => ({
      productId: p.id,
      title: p.title,
      sku: (p.id || "").slice(0, 8).toUpperCase(),
      barcode: (p.id || "").slice(0, 8).toUpperCase(),
      price: Number(p.price) || 0,
      amount: typeof p.stock === "number" && p.stock > 0 ? Math.min(p.stock, 50) : 1,
    }));
    setRows(newRows);
    toast.success(`${newRows.length} ta mahsulot qoʻshildi`);
  }, [products, rows.length]);

  const handleImportFile = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const parsed: ParsedProduct[] = await parseProductsFromFile(file, categories);
        if (parsed.length === 0) {
          toast.error("Faylda mahsulot topilmadi");
          return;
        }
        // Match parsed titles against existing products to attach prices/IDs
        const newRows: Row[] = [];
        let unmatched = 0;
        for (const p of parsed) {
          const live = products.find(
            (lp) => lp.title.trim().toLowerCase() === p.title.trim().toLowerCase(),
          );
          if (!live) {
            unmatched++;
            continue;
          }
          newRows.push({
            productId: live.id,
            title: live.title,
            sku: (live.id || "").slice(0, 8).toUpperCase(),
            barcode: (live.id || "").slice(0, 8).toUpperCase(),
            price: Number(live.price) || 0,
            amount: typeof p.stock === "number" && p.stock > 0 ? p.stock : 1,
          });
        }
        if (newRows.length === 0) {
          toast.error("Hech qanday mos mahsulot topilmadi");
          return;
        }
        setRows((prev) => [...prev, ...newRows]);
        toast.success(
          `${newRows.length} ta etiketka qoʻshildi${unmatched > 0 ? ` · ${unmatched} ta mos kelmadi` : ""}`,
        );
      } catch (err) {
        console.error(err);
        toast.error("Faylni oʻqishda xatolik");
      } finally {
        setImporting(false);
      }
    },
    [products, categories],
  );

  const handleCancel = () => {
    if (rows.length > 0 && !window.confirm("Barcha qatorlar yoʻq qilinsinmi?")) return;
    setRows([]);
    setSearch("");
  };

  const handleSave = () => {
    if (rows.length === 0) {
      toast.error("Avval mahsulot qoʻshing");
      return;
    }
    const valid = rows.filter((r) => r.amount > 0);
    if (valid.length === 0) {
      toast.error("Hech qanday qatorda miqdor 0 dan katta emas");
      return;
    }
    const items: LabelItem[] = valid.map((r) => ({
      productId: r.productId,
      title: r.title,
      sku: r.sku,
      barcode: r.barcode || r.sku,
      priceUZS: r.price,
      amount: r.amount,
    }));
    printLabels(items, template, { storeName: "MEGAHOME ULGURJI" });
    toast.success(
      `${valid.reduce((s, r) => s + r.amount, 0)} ta etiketka chop etish uchun tayyorlandi`,
    );
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <PanelTitle title="Etiketkalar" />

      <div className="px-4 sm:px-6 pb-6 max-w-6xl mx-auto space-y-4">
        {/* ── Settings card: Organization + Label template ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">
                <span className="text-red-500">*</span> Organizatsiya
              </label>
              <div className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm flex items-center gap-2">
                <Building2 className="size-4 text-blue-500 shrink-0" />
                <span className="font-bold text-gray-900">MegaHome</span>
              </div>
            </div>
            <div ref={templateMenuRef} className="relative">
              <label className="block text-sm text-gray-700 mb-1.5">
                <span className="text-red-500">*</span> Etiketka shabloni
              </label>
              <button
                onClick={() => setTemplateOpen((v) => !v)}
                className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm flex items-center justify-between hover:border-gray-300 active:scale-[0.99] transition"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Tag className="size-4 text-blue-500 shrink-0" />
                  <span className="font-medium truncate">{template.name}</span>
                </span>
                <span className="text-[11px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-1.5 py-0.5 ml-2 shrink-0 tabular-nums">
                  {template.widthMm} × {template.heightMm}
                </span>
              </button>
              {templateOpen && (
                <div className="absolute top-12 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-20">
                  {LABEL_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTemplateId(t.id);
                        setTemplateOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                        t.id === template.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <span className={t.id === template.id ? "text-blue-600 font-bold" : "text-gray-700"}>
                        {t.name}
                      </span>
                      <span className="text-[11px] text-gray-500 tabular-nums">
                        {t.widthMm} × {t.heightMm} mm
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Products card ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
          {/* Action buttons */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-bold text-gray-900">Mahsulotlar</p>
              {rows.length > 0 && (
                <span className="text-[11px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-1.5 py-0.5">
                  {rows.length} qator · {totalLabels} ta etiketka
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAutocomplete}
                className="h-10 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs uppercase font-bold tracking-wide gap-1.5 shadow-sm shadow-blue-500/25"
              >
                <Sparkles className="size-3.5" />
                Autocomplete
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                variant="outline"
                className="h-10 rounded-xl border-blue-300 text-blue-600 hover:bg-blue-50 text-xs uppercase font-bold tracking-wide gap-1.5"
              >
                <Upload className="size-3.5" />
                {importing ? "Yuklanmoqda..." : "Import"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
            </div>
          </div>

          {/* Table */}
          <div className="border-t border-gray-100">
            <div className="grid grid-cols-[36px_minmax(0,2fr)_minmax(80px,1fr)_minmax(120px,1fr)_120px_72px] gap-2 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <span>№</span>
              <span>Products</span>
              <span>SKU</span>
              <span>Barcode</span>
              <span>Amount</span>
              <span></span>
            </div>

            {rows.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Not found :(</div>
            ) : (
              rows.map((r, idx) => (
                <div
                  key={`${r.productId}-${idx}`}
                  className="grid grid-cols-[36px_minmax(0,2fr)_minmax(80px,1fr)_minmax(120px,1fr)_120px_72px] gap-2 px-2 py-2.5 items-center border-b border-gray-100 hover:bg-gray-50/40 transition-colors"
                >
                  <span className="text-sm text-gray-500 tabular-nums">{idx + 1}</span>
                  <span className="text-sm text-gray-900 truncate" title={r.title}>{r.title}</span>
                  <span className="text-sm text-gray-700 font-mono">{r.sku}</span>
                  <input
                    type="text"
                    value={r.barcode}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, barcode: e.target.value.toUpperCase() } : row)),
                      )
                    }
                    placeholder="—"
                    className="h-9 px-2 rounded-md border border-gray-200 bg-white text-sm font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.amount === 0 ? "" : String(r.amount)}
                    onChange={(e) => setAmount(r.productId, idx, e.target.value)}
                    placeholder="0"
                    className={`h-9 px-2 rounded-md border bg-white text-sm font-bold tabular-nums outline-none ${
                      r.amount > 0
                        ? "border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        : "border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                    }`}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => cloneRow(idx)}
                      className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 active:scale-95 transition"
                      aria-label="Nusxa"
                      title="Nusxa"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      onClick={() => removeRow(idx)}
                      className="size-8 rounded-md hover:bg-red-50 flex items-center justify-center text-red-400 hover:text-red-600 active:scale-95 transition"
                      aria-label="O'chirish"
                      title="Oʻchirish"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Search bar to add more products */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Mahsulot qidirish..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-lg"
                aria-label="Tozalash"
              >
                <X className="size-4 text-gray-400" />
              </button>
            )}

            {/* Inline search dropdown */}
            {showSearchResults && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-30 max-h-80 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <p className="p-6 text-center text-sm text-gray-400">
                    {products.length === 0 ? "Mahsulotlar yuklanmoqda..." : "Mahsulot topilmadi"}
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredProducts.map((p) => {
                      const stockNum = typeof p.stock === "number" ? p.stock : 0;
                      const inList = rows.some((r) => r.productId === p.id);
                      return (
                        <button
                          key={p.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            addRow(p);
                            setSearch("");
                            searchInputRef.current?.focus();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition text-left"
                        >
                          <div className="relative size-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                            {p.productImageUrl?.[0]?.url ? (
                              <Image src={p.productImageUrl[0].url} alt={p.title} fill className="object-cover" sizes="40px" />
                            ) : (
                              <div className="size-full flex items-center justify-center text-gray-300">
                                <Tag className="size-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                              <span>{formatUZS(p.price)}</span>
                              <span className={`font-bold ${stockNum <= 0 ? "text-red-500" : stockNum < 5 ? "text-amber-600" : "text-emerald-600"}`}>
                                {stockNum > 0 ? `${stockNum} dona` : "tugagan"}
                              </span>
                            </p>
                          </div>
                          {inList ? (
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-1.5 py-0.5">
                              Roʻyxatda
                            </span>
                          ) : (
                            <div className="size-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/30">
                              <Plus className="size-4 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Action buttons (Cancel / Save) ── */}
        <div className="flex justify-end gap-3">
          <Button
            onClick={handleCancel}
            variant="outline"
            className="h-11 px-6 rounded-xl text-sm font-bold uppercase tracking-wide border-blue-300 text-blue-600 hover:bg-blue-50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={rows.length === 0 || totalLabels === 0}
            className="h-11 px-8 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-sm font-bold uppercase tracking-wide shadow-sm shadow-blue-500/25"
          >
            Save
          </Button>
        </div>

        {/* Help footer */}
        <p className="text-xs text-gray-400 text-center pb-4">
          🖨️ &quot;Save&quot; bosish A4 qogʻozda barcha etiketkalarni chop etish uchun yangi oynani ochadi.
          {" "}Barkodlar Code 128 formatida real skanerlash uchun yaratiladi.
        </p>
      </div>
    </div>
  );
}
