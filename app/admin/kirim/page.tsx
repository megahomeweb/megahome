"use client";
import React, { useEffect, useState } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import { Button } from '@/components/ui/button';
import useProductStore from '@/store/useProductStore';
import { useStockReceiptStore } from '@/store/useStockReceiptStore';
import { StockReceiptItem } from '@/lib/types';
import { formatUZS } from '@/lib/formatPrice';
import { formatDateTimeShort } from "@/lib/formatDate";
import toast from 'react-hot-toast';
import { Trash2, PackagePlus } from 'lucide-react';

const KirimPage = () => {
  const { products, fetchProducts } = useProductStore();
  const { receipts, addReceipt, fetchReceipts, loading } = useStockReceiptStore();
  const [supplierName, setSupplierName] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<StockReceiptItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchQuery(inputValue);
    }, 300);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const addItem = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    // Don't add duplicate
    if (items.some((i) => i.productId === productId)) {
      toast.error("Bu mahsulot allaqachon qo'shilgan");
      return;
    }
    setItems([...items, {
      productId: product.id,
      productTitle: product.title,
      quantity: 1,
      unitCost: product.costPrice || 0,
      totalCost: product.costPrice || 0,
    }]);
    setSearchQuery('');
    setInputValue('');
  };

  const updateItem = (index: number, field: 'quantity' | 'unitCost', value: number) => {
    setItems(items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      updated.totalCost = updated.quantity * updated.unitCost;
      return updated;
    }));
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.totalCost, 0);

  const handleSubmit = async () => {
    if (!supplierName.trim()) return toast.error("Yetkazib beruvchi nomini kiriting");
    if (items.length === 0) return toast.error("Kamida bitta mahsulot qo'shing");
    if (items.some((i) => i.quantity <= 0 || i.unitCost <= 0)) return toast.error("Miqdor va narxni to'g'ri kiriting");

    setSubmitting(true);
    try {
      await addReceipt({
        supplierName: supplierName.trim(),
        items,
        totalAmount,
        note: note.trim() || undefined,
        date: null as any, // Will be overwritten in store
      });
      toast.success("Kirim muvaffaqiyatli saqlandi! Ombor yangilandi.");
      setSupplierName('');
      setNote('');
      setItems([]);
    } catch {
      toast.error("Kirimni saqlashda xatolik");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = searchQuery.length >= 2
    ? products.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  return (
    <div>
      <PanelTitle title="Kirim (Tovar qabul qilish)" />

      <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-3 sm:space-y-4">
        {/* Supplier */}
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Yetkazib beruvchi*</label>
            <input
              placeholder="Yetkazib beruvchi nomi"
              className="w-full rounded-xl bg-[#e7edf3] px-4 h-10 text-sm focus:outline-none"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Izoh (ixtiyoriy)</label>
            <input
              placeholder="Faktura raqami yoki izoh"
              className="w-full rounded-xl bg-[#e7edf3] px-4 h-10 text-sm focus:outline-none"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {/* Product search + add */}
        <div className="relative">
          <label className="text-sm font-medium text-gray-700 block mb-1">Mahsulot qo&apos;shish</label>
          <input
            placeholder="Mahsulot nomini qidiring..."
            className="w-full rounded-xl bg-[#e7edf3] px-4 h-10 text-sm focus:outline-none"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {filteredProducts.length > 0 && (
            <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addItem(p.id)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex justify-between items-center cursor-pointer"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-gray-500 text-xs">Ombor: {p.stock ?? '—'} ta</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items: desktop table, mobile cards */}
        {items.length > 0 && (
          <>
            <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Mahsulot</th>
                    <th className="text-center px-4 py-2 font-medium w-28">Miqdor</th>
                    <th className="text-center px-4 py-2 font-medium w-36">Tan narxi (dona)</th>
                    <th className="text-right px-4 py-2 font-medium w-36">Jami</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.productId} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium">{item.productTitle}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-full text-center rounded-lg bg-gray-100 h-8 text-sm focus:outline-none"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-full text-center rounded-lg bg-gray-100 h-8 text-sm focus:outline-none"
                          value={item.unitCost}
                          onChange={(e) => updateItem(index, 'unitCost', parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">{formatUZS(item.totalCost)}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 cursor-pointer p-1">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-green-50">
                    <td colSpan={3} className="px-4 py-3 font-bold text-right">Umumiy summa:</td>
                    <td className="px-4 py-3 text-right font-bold text-green-700 text-base">{formatUZS(totalAmount)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Mobile cards — qty/cost inputs stacked side-by-side, item title on its own row */}
            <div className="sm:hidden space-y-2">
              {items.map((item, index) => (
                <div key={item.productId} className="border border-gray-200 rounded-xl p-2.5 bg-white">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug flex-1">{item.productTitle}</p>
                    <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 cursor-pointer p-1 -mt-1 -mr-1 shrink-0">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase font-semibold">Miqdor</label>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="w-full text-center rounded-lg bg-gray-100 h-11 text-base focus:outline-none"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase font-semibold">Tan narxi</label>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="w-full text-center rounded-lg bg-gray-100 h-11 text-base focus:outline-none"
                        value={item.unitCost}
                        onChange={(e) => updateItem(index, 'unitCost', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-100">
                    <span className="text-gray-500">Jami</span>
                    <span className="font-bold text-green-700 tabular-nums">{formatUZS(item.totalCost)}</span>
                  </div>
                </div>
              ))}
              <div className="border-2 border-green-200 bg-green-50 rounded-xl p-3 flex items-center justify-between">
                <span className="font-bold text-sm">Umumiy summa</span>
                <span className="font-bold text-green-700 text-base tabular-nums">{formatUZS(totalAmount)}</span>
              </div>
            </div>
          </>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
            className="bg-black text-white rounded-xl h-10 px-6 cursor-pointer"
          >
            <PackagePlus className="size-4 mr-2" />
            {submitting ? "Saqlanmoqda..." : "Kirimni saqlash"}
          </Button>
        </div>

        {/* Recent receipts */}
        <div className="mt-8">
          <h3 className="font-bold text-lg mb-3">Oxirgi kirimlar</h3>
          <p className="text-xs text-gray-400 mb-2">Jami: {receipts.length} ta kirim</p>
          {loading ? (
            <p className="text-gray-500 text-sm">Yuklanmoqda...</p>
          ) : receipts.length === 0 ? (
            <p className="text-gray-500 text-sm">Kirimlar mavjud emas</p>
          ) : (
            <div className="space-y-2">
              {receipts.slice(0, visibleCount).map((r) => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{r.supplierName}</p>
                    <p className="text-xs text-gray-500">
                      {r.items.length} ta mahsulot &middot; {formatDateTimeShort(r.date)}
                    </p>
                  </div>
                  <p className="font-bold text-green-700">{formatUZS(r.totalAmount)}</p>
                </div>
              ))}
              {receipts.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount(prev => prev + 10)}
                  className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  Ko&apos;proq ko&apos;rish ({receipts.length - visibleCount} ta qoldi)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KirimPage;
