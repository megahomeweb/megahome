"use client";
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import useProductStore from '@/store/useProductStore';
import { formatUZS } from '@/lib/formatPrice';
import toast from 'react-hot-toast';
import { Percent, X } from 'lucide-react';

interface Props {
  productIds: string[];
  onClose: () => void;
}

const BulkPriceUpdateModal = ({ productIds, onClose }: Props) => {
  const [percent, setPercent] = useState<number>(0);
  const [updateCost, setUpdateCost] = useState(false);
  const [loading, setLoading] = useState(false);
  const { products, bulkUpdatePrices } = useProductStore();

  const selectedProducts = products.filter((p) => productIds.includes(p.id));
  const multiplier = 1 + (percent / 100);

  const handleSubmit = async () => {
    if (percent === 0) return toast.error("Foizni kiriting");
    if (percent <= -100) return toast.error("Narx manfiy bo'lishi mumkin emas");

    setLoading(true);
    try {
      const count = await bulkUpdatePrices(productIds, percent, updateCost);
      toast.success(`${count} ta mahsulot narxi yangilandi`);
      onClose();
    } catch {
      toast.error("Narxlarni yangilashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-lg w-full mx-4 p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer">
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Percent className="size-5 text-primary" />
          <h2 className="text-lg font-bold">Narxni ommaviy yangilash</h2>
        </div>

        <p className="text-sm text-gray-500 mb-4">{selectedProducts.length} ta mahsulot tanlangan</p>

        {/* Percent input */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 block mb-1">Foiz o&apos;zgarishi (%)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              pattern="-?[0-9]*\.?[0-9]*"
              className="flex-1 rounded-xl bg-[#e7edf3] px-4 h-11 text-base focus:outline-none"
              value={percent || ''}
              onChange={(e) => setPercent(parseFloat(e.target.value) || 0)}
              placeholder="Masalan: 10 yoki -5"
            />
            <span className="text-sm font-bold text-gray-500">%</span>
          </div>
        </div>

        {/* Update cost checkbox */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            checked={updateCost}
            onChange={(e) => setUpdateCost(e.target.checked)}
          />
          <span className="text-sm text-gray-700">Tan narxini ham yangilash</span>
        </label>

        {/* Preview */}
        {percent !== 0 && selectedProducts.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3 mb-4 max-h-48 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Ko&apos;rib chiqish:</p>
            {selectedProducts.slice(0, 8).map((p) => {
              const oldPrice = Number(p.price);
              const newPrice = Math.round(oldPrice * multiplier);
              return (
                <div key={p.id} className="flex justify-between text-xs py-1 border-b border-gray-100">
                  <span className="truncate flex-1">{p.title}</span>
                  <span className="text-gray-400 line-through ml-2">{formatUZS(oldPrice)}</span>
                  <span className={`font-bold ml-2 ${percent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatUZS(newPrice)}
                  </span>
                </div>
              );
            })}
            {selectedProducts.length > 8 && (
              <p className="text-xs text-gray-400 mt-1">... va yana {selectedProducts.length - 8} ta</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-xl cursor-pointer">Bekor qilish</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || percent === 0}
            className="bg-black text-white rounded-xl cursor-pointer"
          >
            {loading ? "Yangilanmoqda..." : "Tasdiqlash"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BulkPriceUpdateModal;
