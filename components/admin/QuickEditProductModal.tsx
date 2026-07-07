"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import useProductStore from "@/store/useProductStore";
import { formatUZS } from "@/lib/formatPrice";
import { toWholeMoney } from "@/lib/money";
import toast from "react-hot-toast";
import type { ProductT } from "@/lib/types";

interface QuickEditProductModalProps {
  product: ProductT;
  onClose: () => void;
}

export default function QuickEditProductModal({ product, onClose }: QuickEditProductModalProps) {
  const { updateProduct } = useProductStore();
  const [title, setTitle] = useState(product.title);
  const [price, setPrice] = useState(product.price);
  const [costPrice, setCostPrice] = useState(product.costPrice || 0);
  const [stock, setStock] = useState(typeof product.stock === "number" ? product.stock : 0);
  const [loading, setLoading] = useState(false);

  const profit = Number(price) - costPrice;
  const margin = Number(price) > 0 ? (profit / Number(price)) * 100 : 0;

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Nomi bo'sh bo'lishi mumkin emas"); return; }
    if (Number(price) <= 0) { toast.error("Narx 0 dan katta bo'lishi kerak"); return; }
    setLoading(true);
    try {
      // Whole-dollar policy: normalize price/cost to integers on save.
      await updateProduct(product.id, {
        ...product,
        title: title.trim(),
        price: String(toWholeMoney(price)),
        costPrice: toWholeMoney(costPrice),
        stock,
      });
      toast.success("Mahsulot yangilandi");
      onClose();
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full sm:mx-4 p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button onClick={onClose} aria-label="Yopish" className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100">
          <X className="size-5 text-gray-400" />
        </button>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Tezkor tahrirlash</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Nomi</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Sotish narxi</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Tan narxi</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" value={costPrice} onChange={(e) => setCostPrice(Number(e.target.value))} className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Ombor soni</label>
            <input type="number" inputMode="numeric" pattern="[0-9]*" value={stock} onChange={(e) => setStock(Number(e.target.value))} className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 text-sm">
            <span className="text-gray-500">Foyda:</span>
            <span className={profit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
              {formatUZS(profit)} ({margin.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Bekor qilish</Button>
          <Button onClick={handleSave} disabled={loading} className="flex-1 rounded-xl bg-gray-900 hover:bg-gray-800 text-white">
            {loading ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </div>
      </div>
    </div>
  );
}
