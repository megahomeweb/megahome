"use client"
import PanelTitle from '@/components/admin/PanelTitle';
import ProductTable from '@/components/admin/ProductTable';
import Search from '@/components/admin/Search';
import React, { useMemo, useState } from 'react'
import useCategoryStore from '@/store/useCategoryStore';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import useProductStore from '@/store/useProductStore';
import { exportProductsToExcel } from '@/lib/exportExcel';
import { exportProductsForUpdate } from '@/lib/exportForUpdate';
import BulkPriceUpdateModal from '@/components/admin/BulkPriceUpdateModal';
import BulkStockUpdateModal from '@/components/admin/BulkStockUpdateModal';
import FloatingActionBar from '@/components/admin/FloatingActionBar';
import ProductActionsMenu, { ProductPrimaryActions } from '@/components/admin/ProductActionsMenu';
import { Plus, FolderPlus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { fireStorage } from '@/firebase/config';
import { ref, listAll, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';
import { generateProductTemplate } from '@/lib/importExcel';
import ImportProductsModal from '@/components/admin/ImportProductsModal';
import ReimportProductsModal from '@/components/admin/ReimportProductsModal';
import QuickEditProductModal from '@/components/admin/QuickEditProductModal';
import BatchCategoryMoveModal from '@/components/admin/BatchCategoryMoveModal';
import { ProductT } from '@/lib/types';

const CategoryFilter = ({ activeCategory, setActiveCategory, categoryCounts, totalCount }: { activeCategory: string, setActiveCategory: (cat: string) => void, categoryCounts: Record<string, number>, totalCount: number }) => {
  const { categories, fetchCategories } = useCategoryStore();

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return (
    <div data-no-swipe className="flex gap-2 px-3 sm:px-4 pb-3 sm:pb-4 overflow-x-auto scrollbar-hide sm:flex-wrap sm:overflow-visible">
      <Button
        variant={"default"}
        className={`cursor-pointer px-3 sm:px-4 h-9 sm:h-10 rounded-xl border text-xs sm:text-sm font-medium transition-all shrink-0 ${activeCategory === 'all' ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-100/90 text-black'}`}
        onClick={() => setActiveCategory('all')}
      >
        Barchasi ({totalCount})
      </Button>
      {categories.map((cat) => (
        <Button
          variant={"default"}
          key={cat.id}
          className={`cursor-pointer px-3 sm:px-4 h-9 sm:h-10 rounded-xl border text-xs sm:text-sm font-medium transition-all shrink-0 ${activeCategory === cat.name ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-100/90 text-black'}`}
          onClick={() => setActiveCategory(cat.name)}
        >
          {cat.name} ({categoryCounts[cat.name] ?? 0})
        </Button>
      ))}
    </div>
  );
};

const Products = () => {
  const [search, setSearch] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSubcategory, setActiveSubcategory] = useState<string>('all');
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showBulkStock, setShowBulkStock] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReimport, setShowReimport] = useState(false);
  const [showCategoryMove, setShowCategoryMove] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quickEditProduct, setQuickEditProduct] = useState<ProductT | null>(null);
  const { categories } = useCategoryStore();
  const { products, fetchProducts, deleteAllProducts, deleteProduct } = useProductStore();

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearchChange = (e: string) => {
    setSearch(e)
  }

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      // Delete all product images from Firebase Storage
      for (const product of products) {
        if (product.storageFileId) {
          try {
            const folderRef = ref(fireStorage, `products/${product.storageFileId}`);
            const fileList = await listAll(folderRef);
            await Promise.all(fileList.items.map((item) => deleteObject(item)));
          } catch {
            // Storage folder may not exist, continue
          }
        }
      }
      // Delete all Firestore documents
      await deleteAllProducts();
      toast.success(`${products.length} ta mahsulot o'chirildi`);
    } catch {
      toast.error('Xatolik yuz berdi');
    } finally {
      setDeletingAll(false);
      setShowDeleteAll(false);
    }
  };

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setActiveSubcategory('all');
  };

  const SubcategoryFilter = ({
    activeCategory,
    activeSubcategory,
    setActiveSubcategory,
  }: {
    activeCategory: string;
    activeSubcategory: string;
    setActiveSubcategory: (subcat: string) => void;
  }) => {
    const selectedCategory = categories.find((cat) => cat.name === activeCategory);

    // Compute memoized values before any early returns to satisfy hooks rules.
    // Deps include `products` — without it, the subcategory counts froze at
    // the moment the user first opened a category and never reflected new
    // imports, deletes, or category moves. `products` is captured from the
    // parent closure but the linter can't see that, so it's silently stale.
    const productsInCategory = useMemo(() => (
      products.filter((p) => p.category === activeCategory)
    ), [activeCategory, products]);

    const allInCategoryCount = productsInCategory.length;

    const subcategoryCounts: Record<string, number> = useMemo(() => {
      const counts: Record<string, number> = {};
      for (const p of productsInCategory) {
        if (!p.subcategory) continue;
        counts[p.subcategory] = (counts[p.subcategory] ?? 0) + 1;
      }
      return counts;
    }, [productsInCategory]);

    if (!selectedCategory || !selectedCategory.subcategory || selectedCategory.subcategory.length === 0) {
      return null;
    }

    return (
      <div className='px-3 sm:px-4 pb-3 sm:pb-4'>
        <h3 className='text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 pl-1 text-gray-500'>Subkategoriya bo&apos;yicha filter</h3>
        <div data-no-swipe className="flex gap-2 overflow-x-auto scrollbar-hide sm:flex-wrap sm:overflow-visible">
          <Button
            variant={"default"}
            className={`cursor-pointer px-3 sm:px-4 h-9 sm:h-10 rounded-xl border text-xs sm:text-sm font-medium transition-all shrink-0 ${activeSubcategory === 'all' ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-100/90 text-black'}`}
            onClick={() => setActiveSubcategory('all')}
          >
            Barchasi ({allInCategoryCount})
          </Button>
          {selectedCategory.subcategory.map((subcat: string) => (
            <Button
              variant={"default"}
              key={subcat}
              className={`cursor-pointer px-3 sm:px-4 h-9 sm:h-10 rounded-xl border text-xs sm:text-sm font-medium transition-all shrink-0 ${activeSubcategory === subcat ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-100/90 text-black'}`}
              onClick={() => setActiveSubcategory(subcat)}
            >
              {subcat} ({subcategoryCounts[subcat] ?? 0})
            </Button>
          ))}
        </div>
      </div>
    );
  };

  const filteredForExport = activeCategory === 'all'
    ? products
    : products.filter((p) => p.category === activeCategory);

  return (
    <div>
      <PanelTitle title='Mahsulotlar' />
      {/* Primary CTAs + overflow menu — all ≥h-10 for one-thumb use on 360dp */}
      <div data-no-swipe className="flex gap-2 px-3 sm:px-4 pb-2 sm:pb-3 flex-wrap items-center">
        <Link href="/admin/create-product" className="shrink-0">
          <Button className="h-9 sm:h-10 rounded-xl cursor-pointer text-xs sm:text-sm gap-1 sm:gap-1.5 bg-black text-white hover:bg-black/90 btn-press glow-green px-2.5 sm:px-4">
            <Plus className="size-4" /> Mahsulot
          </Button>
        </Link>
        <Link href="/admin/create-category" className="shrink-0">
          <Button variant="outline" className="h-9 sm:h-10 rounded-xl cursor-pointer text-xs sm:text-sm gap-1 sm:gap-1.5 btn-press px-2.5 sm:px-4">
            <FolderPlus className="size-4" /> Kategoriya
          </Button>
        </Link>
        <div className="ml-auto flex gap-1.5 sm:gap-2">
          <ProductPrimaryActions
            hasProducts={products.length > 0}
            onExportExcel={() =>
              exportProductsToExcel(filteredForExport, `mahsulotlar_${activeCategory}`)
            }
            onImport={() => setShowImport(true)}
          />
          <ProductActionsMenu
            hasProducts={products.length > 0}
            onBulkPriceUpdate={() => setShowBulkUpdate(true)}
            onExportForUpdate={() => {
              exportProductsForUpdate(filteredForExport);
              toast.success(`${filteredForExport.length} ta mahsulot eksport qilindi`);
            }}
            onDownloadTemplate={() => generateProductTemplate(categories)}
            onReimport={() => setShowReimport(true)}
            onDeleteAll={() => setShowDeleteAll(true)}
          />
        </div>
      </div>
      <Search search={search} handleSearchChange={handleSearchChange} placeholder='Mahsulotlarni qidirish' />
      <CategoryFilter
        activeCategory={activeCategory}
        setActiveCategory={handleCategoryChange}
        categoryCounts={useMemo(() => {
          const counts: Record<string, number> = {};
          for (const p of products) {
            counts[p.category] = (counts[p.category] ?? 0) + 1;
          }
          return counts;
        }, [products])}
        totalCount={products.length}
      />
      <SubcategoryFilter
        activeCategory={activeCategory}
        activeSubcategory={activeSubcategory}
        setActiveSubcategory={setActiveSubcategory}
      />

      <ProductTable
        search={search}
        category={activeCategory}
        subcategory={activeSubcategory}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onQuickEdit={(product) => setQuickEditProduct(product)}
      />

      {showBulkUpdate && (
        <BulkPriceUpdateModal
          productIds={
            (activeCategory === 'all' ? products : products.filter((p) => p.category === activeCategory))
              .map((p) => p.id)
          }
          onClose={() => setShowBulkUpdate(false)}
        />
      )}

      {showImport && (
        <ImportProductsModal onClose={() => setShowImport(false)} />
      )}

      {showReimport && (
        <ReimportProductsModal onClose={() => setShowReimport(false)} />
      )}

      {showDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                <Trash2 className="size-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-black">Hammasini o&apos;chirish</h3>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Barcha <span className="font-bold text-black">{products.length} ta</span> mahsulot va ularning rasmlari butunlay o&apos;chiriladi.
            </p>
            <p className="text-sm text-red-600 font-medium mb-6">
              Bu amalni qaytarib bo&apos;lmaydi!
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl cursor-pointer"
                onClick={() => setShowDeleteAll(false)}
                disabled={deletingAll}
              >
                Bekor qilish
              </Button>
              <Button
                className="flex-1 rounded-xl cursor-pointer bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDeleteAll}
                disabled={deletingAll}
              >
                {deletingAll ? 'O\'chirilmoqda...' : 'Ha, hammasini o\'chir'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBulkStock && (
        <BulkStockUpdateModal
          selectedIds={Array.from(selectedIds)}
          onClose={() => { setShowBulkStock(false); setSelectedIds(new Set()); }}
        />
      )}

      {showCategoryMove && (
        <BatchCategoryMoveModal
          selectedIds={Array.from(selectedIds)}
          onClose={() => { setShowCategoryMove(false); setSelectedIds(new Set()); }}
        />
      )}

      {quickEditProduct && (
        <QuickEditProductModal
          product={quickEditProduct}
          onClose={() => setQuickEditProduct(null)}
        />
      )}

      <FloatingActionBar
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkPriceUpdate={() => setShowBulkUpdate(true)}
        onBulkStockUpdate={() => setShowBulkStock(true)}
        onBatchCategoryMove={() => setShowCategoryMove(true)}
        onBulkDelete={async () => {
          if (!confirm(`${selectedIds.size} ta mahsulotni o'chirmoqchimisiz?`)) return;
          for (const id of selectedIds) {
            const product = products.find(p => p.id === id);
            if (product?.storageFileId) {
              try {
                const folderRef = ref(fireStorage, `products/${product.storageFileId}`);
                const fileList = await listAll(folderRef);
                await Promise.all(fileList.items.map((item) => deleteObject(item)));
              } catch { /* ignore */ }
            }
            await deleteProduct(id);
          }
          toast.success(`${selectedIds.size} ta mahsulot o'chirildi`);
          setSelectedIds(new Set());
        }}
      />
    </div>
  )
}

export default Products