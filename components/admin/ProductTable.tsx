"use client"
import Image from 'next/image';
import React, { useEffect, useMemo } from 'react'
import { Button } from '../ui/button';
import { BiEdit, BiTrash } from 'react-icons/bi';
import { Copy, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import useProductStore from '@/store/useProductStore';
import { formatUZS } from '@/lib/formatPrice';
import { matchesSearch } from '@/lib/searchMatch';
import { ProductT } from '@/lib/types';
import { ProductTableSkeleton, ProductCardListSkeleton } from './skeletons/ListSkeletons';
import { fireStorage } from '@/firebase/config';
import { deleteObject, listAll, ref } from 'firebase/storage';
import toast from 'react-hot-toast';
import Pagination, { usePagination } from './Pagination';

interface ProductTableProps {
  search: string;
  category?: string;
  subcategory?: string;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onQuickEdit: (product: ProductT) => void;
}

const ProductTable = ({ search, category = 'all', subcategory = 'all', selectedIds, onSelectionChange, onQuickEdit }: ProductTableProps) => {
  const router = useRouter();
  const { products, loading, fetchProducts, deleteProduct, updateProduct, duplicateProduct } = useProductStore();
  
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Search + Category + Subcategory filter logic
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (category !== 'all') {
      filtered = filtered.filter(product => product.category === category);
    }
    if (subcategory !== 'all') {
      filtered = filtered.filter(product => product.subcategory === subcategory);
    }
    if (search.length >= 2) {
      filtered = filtered.filter((product) => (
        matchesSearch(product.title, search) ||
        matchesSearch(product.category ?? '', search) ||
        matchesSearch(product.subcategory ?? '', search)
      ));
    }
    return filtered;
  }, [products, search, category, subcategory]);

  // Pagination — operates on the filtered list
  const { page, perPage, setPage, setPerPage, pageItems, total } = usePagination(filteredProducts, 25);

  // Selection helpers operate on what's *visible on this page*
  const allVisibleSelected = pageItems.length > 0 && pageItems.every((p) => selectedIds.has(p.id));

  const handleToggleAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selectedIds);
      for (const p of pageItems) next.delete(p.id);
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      for (const p of pageItems) next.add(p.id);
      onSelectionChange(next);
    }
  };

  const handleToggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleEdit = (id: string) => {
    router.push(`/admin/update-product/${id}`);
  }

  const handleDelete = async (item: ProductT) => {
    if (item.id) {
      const imageFolderRef = ref(fireStorage, `products/${item.storageFileId}`);
      const imageRefs = await listAll(imageFolderRef);
      
      const deleteImagePromises = imageRefs.items.map(async (itemRef) => {
        await deleteObject(itemRef);
      });
      await Promise.all(deleteImagePromises);

      await deleteProduct(item.id);
      toast.success("Mahsulot muvaffaqiyatli o'chirildi");
    }
  };

  const handleStockChange = async (product: ProductT, delta: number) => {
    const current = typeof product.stock === 'number' ? product.stock : 0;
    const newStock = Math.max(0, current + delta);
    try {
      await updateProduct(product.id, { stock: newStock } as any);
    } catch {
      toast.error("Omborni yangilashda xatolik");
    }
  };

  return (
     <div className="w-full px-3 sm:px-4 py-2 sm:py-3">
      {/* Desktop and Tablet view */}
      <div className="hidden custom:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full w-full">
          <thead>
            <tr className="bg-white">
              <th className="px-4 py-3 text-center">
                <input type="checkbox" checked={allVisibleSelected} onChange={handleToggleAll} className="size-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer" />
              </th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">T/r</th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Nomi</th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Rasm</th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Narxi</th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Ombor</th>
              <th className="px-4 py-3 text-left text-black text-sm max-w-[100px] font-medium">Kategoriya</th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Subkategoriya</th>
              <th className="px-4 py-3 text-black text-sm font-medium text-center">Tez tahrir</th>
              <th className="px-4 py-3 text-black text-sm font-medium text-center">Tahrirlash</th>
              <th className="px-4 py-3 text-black text-sm font-medium text-center">O&apos;chirish</th>
            </tr>
          </thead>
          <tbody>
            {loading && products.length === 0 ? (
              <ProductTableSkeleton rows={6} />
            ) : total === 0 ? (
              <tr>
                <td colSpan={11} className="h-20 px-4 py-2 text-center text-gray-500">
                  {search.length >= 2 ? "Mahsulotlar topilmadi" : "Mahsulotlar mavjud emas"}
                </td>
              </tr>
            ) : (pageItems.map((product, index) => (
              <tr key={product.id} className={`border-t border-gray-200 ${selectedIds.has(product.id) ? 'bg-blue-50/50' : ''}`}>
                <td className="h-20 px-4 py-2 text-center">
                  <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => handleToggleOne(product.id)} className="size-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer" />
                </td>
                <td className="h-20 px-4 py-2 text-black text-sm font-normal text-center">
                  {(page - 1) * perPage + index + 1}
                </td>
                <td className="h-20 px-4 py-2 text-black text-sm font-normal">
                  {product.title}
                </td>
                <td className="h-20 px-4 py-2 text-sm font-normal">
                  <div className='size-16 relative overflow-hidden rounded-2xl'>
                    {product.productImageUrl && product.productImageUrl.length > 0 ? (
                      <Image className='absolute size-full object-cover' src={product.productImageUrl[0].url} fill alt={product.title} />
                    ) : (
                      <div className='absolute size-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs'>
                        Rasm yo&apos;q
                      </div>
                    )}
                  </div>
                </td>
                <td className="h-20 px-4 py-2 text-gray-700 text-sm font-normal">{formatUZS(product.price)}</td>
                <td className="h-20 px-4 py-2 text-sm font-normal">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStockChange(product, -1); }}
                      disabled={(typeof product.stock === 'number' ? product.stock : 0) <= 0}
                      aria-label="Stokni kamaytirish"
                      className="size-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 active:scale-95 disabled:opacity-30 text-sm font-bold transition"
                    >
                      −
                    </button>
                    <span className={`min-w-[36px] text-center text-sm font-bold ${
                      (typeof product.stock === 'number' ? product.stock : 0) <= 5 ? 'text-red-600' : 'text-green-700'
                    }`}>
                      {typeof product.stock === 'number' ? product.stock : 0}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStockChange(product, 1); }}
                      aria-label="Stokni ko'paytirish"
                      className="size-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 active:scale-95 text-sm font-bold transition"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="max-w-xs h-20 px-4 py-2 text-sm font-normal">
                  <span className="flex min-w-[84px] text-center cursor-pointer items-center justify-center rounded-xl min-h-8 px-1 bg-gray-100 text-black text-sm font-medium w-full">
                    {product.category}
                  </span>
                </td>
                <td className="h-20 px-4 py-2 text-sm">
                  {product.subcategory ? (
                    <span className="flex min-w-[84px] text-center cursor-pointer items-center justify-center rounded-xl min-h-8 px-1 bg-gray-100 text-black text-sm font-medium w-full">
                      {product.subcategory}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">----</span>
                  )}
                </td>
                <td className="w-20 h-20 px-4 py-2 text-gray-700 text-sm font-normal">
                  <div className="flex items-center justify-center gap-0.5">
                    <Button onClick={() => onQuickEdit(product)} className='flex items-center justify-center cursor-pointer' variant={'ghost'} size={'icon'}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" title="Nusxa yaratish"
                      onClick={async () => {
                        try {
                          await duplicateProduct(product.id);
                          toast.success("Mahsulot nusxasi yaratildi");
                        } catch {
                          toast.error("Nusxa yaratishda xatolik");
                        }
                      }}>
                      <Copy className="size-3.5 text-gray-400" />
                    </Button>
                  </div>
                </td>
                <td className="w-20 h-20 px-4 py-2 text-gray-700 text-sm font-normal">
                  <Button onClick={() => handleEdit(product.id)} className='flex items-center justify-center mx-auto cursor-pointer' variant={'ghost'}>
                    <BiEdit size={24} />
                  </Button>
                </td>
                <td className="w-20 h-20 px-4 py-2 text-sm font-normal">
                  <Button onClick={() => handleDelete(product)} className="flex items-center justify-center mx-auto cursor-pointer" variant={'default'}>
                    <BiTrash size={24} />
                  </Button>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {/* Mobile view — compact 2-section card. Header packs image + title +
          price + stock pill on one row so the operator can scan a phone-screen
          full of products without scrolling. Footer holds the actions only. */}
      <div className="custom:hidden space-y-2">
        {loading && products.length === 0 ? (
          <ProductCardListSkeleton rows={5} />
        ) : total === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-500 text-sm">
            {search.length >= 2 ? "Mahsulotlar topilmadi" : "Mahsulotlar mavjud emas"}
          </div>
        ) : (pageItems.map((product, index) => {
          const stock = typeof product.stock === 'number' ? product.stock : null;
          return (
          <div key={product.id} className={`bg-white rounded-xl border p-2.5 ${selectedIds.has(product.id) ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={selectedIds.has(product.id)}
                onChange={() => handleToggleOne(product.id)}
                className="size-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer shrink-0"
              />
              <div className='size-12 relative overflow-hidden rounded-lg shrink-0'>
                {product.productImageUrl && product.productImageUrl.length > 0 ? (
                  <Image className='absolute size-full object-cover' src={product.productImageUrl[0].url} fill alt={product.title} />
                ) : (
                  <div className='absolute size-full bg-gray-100 flex items-center justify-center text-gray-400 text-[9px]'>
                    Rasm yo&apos;q
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                  <span className="text-[10px] font-medium text-gray-400 mr-1">{(page - 1) * perPage + index + 1}.</span>
                  {product.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-500">
                  <span className="truncate">{product.category}{product.subcategory ? ` · ${product.subcategory}` : ''}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">{formatUZS(product.price)}</span>
                {stock !== null ? (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    stock <= 0 ? 'bg-red-100 text-red-700' : stock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {stock} ta
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">—</span>
                )}
              </div>
            </div>
            <div data-no-swipe className="flex items-center gap-1.5 pt-2 mt-2 border-t border-gray-100">
              <Button
                onClick={() => onQuickEdit(product)}
                variant={'secondary'}
                className="flex-1 bg-[#e7edf3] rounded-lg h-8 px-2 cursor-pointer text-xs font-bold gap-1"
              >
                <Pencil className="size-3.5" /> Tez
              </Button>
              <Button
                onClick={() => handleEdit(product.id)}
                variant={'secondary'}
                className="flex-1 bg-[#e7edf3] rounded-lg h-8 px-2 cursor-pointer text-xs font-bold"
              >
                Yangilash
              </Button>
              <Button
                onClick={() => handleDelete(product)}
                variant={'default'}
                className="rounded-lg h-8 px-3 bg-black text-white text-xs font-bold cursor-pointer shrink-0"
                aria-label="O'chirish"
              >
                <BiTrash size={14} />
              </Button>
            </div>
          </div>
          );
        }))}
      </div>

      {/* Pagination — same component for desktop & mobile */}
      <Pagination
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
      />
    </div>
  )
}

export default ProductTable