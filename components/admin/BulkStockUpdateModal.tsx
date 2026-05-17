"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import useProductStore from "@/store/useProductStore";
import toast from "react-hot-toast";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { fireDB } from "@/firebase/config";

interface BulkStockUpdateModalProps {
  selectedIds: string[];
  onClose: () => void;
}

export default function BulkStockUpdateModal({ selectedIds, onClose }: BulkStockUpdateModalProps) {
  const { products, bulkUpdateStock } = useProductStore();
  const [mode, setMode] = useState<"set" | "increment">("set");
  const [value, setValue] = useState<number>(0);
  const [reason, setReason] = useState("Inventarizatsiya");
  const [loading, setLoading] = useState(false);

  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));

  const handleSubmit = async () => {
    if (mode === "set" && value < 0) {
      toast.error("Ombor soni manfiy bo'lishi mumkin emas");
      return;
    }
    if (mode === "set" && value > 999999) {
      toast.error("Ombor soni 999 999 dan oshmasligi kerak");
      return;
    }
    if (mode === "increment") {
      const wouldGoNegative = selectedProducts.some((p) => {
        const current = typeof p.stock === "number" ? p.stock : 0;
        return current + value < 0;
      });
      if (wouldGoNegative) {
        toast.error("Ombor soni manfiy bo'lishi mumkin emas");
        return;
      }
    }
    setLoading(true);
    try {
      const updates = selectedProducts.map((p) => ({
        id: p.id,
        stock: mode === "set" ? value : (typeof p.stock === "number" ? p.stock : 0) + value,
      }));
      const count = await bulkUpdateStock(updates);
      // Log stock movements
      for (const { id, stock: newStock } of updates) {
        const product = selectedProducts.find(p => p.id === id);
        const oldStock = typeof product?.stock === 'number' ? product.stock : 0;
        await addDoc(collection(fireDB, "stockMovements"), {
          productId: id,
          productTitle: product?.title || '',
          type: 'tuzatish' as const,
          quantity: newStock - oldStock,
          stockBefore: oldStock,
          stockAfter: newStock,
          reason: reason,
          timestamp: Timestamp.now(),
        });
      }
      toast.success(`${count} ta mahsulot ombori yangilandi`);
      onClose();
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-white rounded-2xl max-w-lg w-full mx-4 p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100">
          <X className="size-5 text-gray-400" />
        </button>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Omborni ommaviy yangilash</h2>
        <p className="text-sm text-gray-500 mb-5">{selectedIds.length} ta mahsulot tanlangan</p>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("set")} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${mode === "set" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
            Aniq son belgilash
          </button>
          <button onClick={() => setMode("increment")} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${mode === "increment" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
            Qo&apos;shish / Ayirish
          </button>
        </div>

        <input type="number" inputMode="numeric" pattern="-?[0-9]*" value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder={mode === "set" ? "Yangi ombor soni" : "+10 yoki -5"} />

        <select value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none mt-3">
          <option value="Inventarizatsiya">Inventarizatsiya (sanash)</option>
          <option value="Zarar / nosozlik">Zarar / nosozlik</option>
          <option value="Qaytarish">Qaytarish</option>
          <option value="Yangi tovar keldi">Yangi tovar keldi</option>
          <option value="Boshqa">Boshqa</option>
        </select>

        <div className="mt-4 max-h-48 overflow-y-auto space-y-1.5">
          {selectedProducts.slice(0, 8).map((p) => {
            const currentStock = typeof p.stock === "number" ? p.stock : 0;
            const newStock = mode === "set" ? value : currentStock + value;
            return (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-sm">
                <span className="truncate mr-3">{p.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gray-400 line-through">{currentStock}</span>
                  <span className="text-gray-400">&rarr;</span>
                  <span className={newStock <= 5 ? "text-red-600 font-bold" : "text-green-600 font-bold"}>{newStock}</span>
                </div>
              </div>
            );
          })}
          {selectedProducts.length > 8 && <p className="text-xs text-gray-400 text-center py-1">... va yana {selectedProducts.length - 8} ta</p>}
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Bekor qilish</Button>
          <Button onClick={handleSubmit} disabled={loading} className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? "Yangilanmoqda..." : "Yangilash"}
          </Button>
        </div>
      </div>
    </div>
  );
}
