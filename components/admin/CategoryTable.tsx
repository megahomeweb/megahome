import React, { useEffect, useMemo } from 'react'
import { Button } from '../ui/button';
import { BiEdit, BiTrash } from 'react-icons/bi';
import Image from 'next/image';
import useCategoryStore from '@/store/useCategoryStore';
import { useRouter } from 'next/navigation';
import { CategoryI } from '@/lib/types';
import { matchesSearch } from '@/lib/searchMatch';
import { deleteObject, listAll, ref } from 'firebase/storage';
import { fireStorage } from '@/firebase/config';
import toast from 'react-hot-toast';

interface CategoryTableProps {
  search: string;
}

const CategoryTable = ({ search }: CategoryTableProps) => {
  const { categories, fetchCategories, deleteCategory } = useCategoryStore();

  const navigate = useRouter()

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Search filter logic
  const filteredCategories = useMemo(() => {
    if (search.length < 2) {
      return categories;
    }
    
    return categories.filter((category) => matchesSearch(category.name, search));
  }, [categories, search]);

  const handleEdit = (id: string) => {
    navigate.push(`/admin/update-category/${id}`);
  }

  const handleDelete = async (item: CategoryI) => {
    if (item.id) {
      const imageFolderRef = ref(
        fireStorage,
        `categories/${item.storageFileId}`
      );
      const imageRefs = await listAll(imageFolderRef);

      const deleteImagePromises = imageRefs.items.map(async (itemRef) => {
        await deleteObject(itemRef);
      });
      await Promise.all(deleteImagePromises);
      deleteCategory(item.id);
      toast.success("Kategoriya muvaffaqiyatli o‘chirildi");
    }
  };

  return (
     <div className="w-full px-3 sm:px-4 py-2 sm:py-3">
      {/* Desktop and Tablet view */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full w-full">
          <thead>
            <tr className="bg-white">
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Nomi</th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Rasm</th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">Subkategoriyalar</th>
              <th className="px-4 py-3 text-black text-sm font-medium text-center">Taxrirlash</th>
              <th className="px-4 py-3 text-black text-sm font-medium text-center">O&apos;chirish</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-20 px-4 py-2 text-center text-gray-500">
                  {search.length >= 2 ? "Kategoriya topilmadi" : "Kategoriyalar mavjud emas"}
                </td>
              </tr>
            ) : (filteredCategories.map((category) => (
              <tr key={category.id} className="border-t border-gray-200">
                <td className="h-20 px-4 py-2 text-black text-sm font-normal">
                  {category.name}
                </td>
               <td className="h-20 px-4 py-2 text-sm font-normal">
                  <div className='size-16 relative overflow-hidden rounded-2xl'>
                    {category.categoryImgUrl && category.categoryImgUrl.length > 0 ? (
                      <Image className='absolute size-full object-cover' src={category.categoryImgUrl[0].url} fill alt={category.name} />
                    ) : (
                      <div className='absolute size-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs'>
                        Rasm yo&apos;q
                      </div>
                    )}
                  </div>
                </td>
                <td className="h-20 px-4 py-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {category.subcategory && category.subcategory.length > 0 ? (
                      category.subcategory.map((tag: string, idx: number) => (
                        <span
                          key={idx}
                          className="rounded-md bg-gray-100 text-gray-700 px-3 py-1 text-xs font-medium"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </div>
                </td>
                <td className="w-20 h-20 px-4 py-2 text-gray-700 text-sm font-normal">
                  <Button onClick={() => handleEdit(category.id)} className='flex items-center justify-center mx-auto cursor-pointer' variant={'ghost'}>
                    <BiEdit size={24} />
                  </Button>
                </td>
                <td className="w-20 h-20 px-4 py-2 text-sm font-normal">
                  <Button onClick={() => handleDelete(category)} className="flex items-center justify-center mx-auto cursor-pointer" variant={'default'}>
                    <BiTrash size={24} />
                  </Button>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {/* Mobile view — compact card matches ProductTable density */}
      <div className="md:hidden space-y-2">
        {filteredCategories.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-500 text-sm">
            {search.length >= 2 ? "Kategoriya topilmadi" : "Kategoriyalar mavjud emas"}
          </div>
        ) : (filteredCategories.map((category, index) => (
          <div key={index} className="bg-white rounded-xl border border-gray-200 p-2.5">
            <div className="flex items-center gap-2.5">
              <div className='size-12 relative overflow-hidden rounded-lg shrink-0'>
                {category.categoryImgUrl && category.categoryImgUrl.length > 0 ? (
                  <Image className='absolute size-full object-cover' src={category.categoryImgUrl[0].url} fill alt={category.name} />
                ) : (
                  <div className='absolute size-full bg-gray-100 flex items-center justify-center text-gray-400 text-[9px]'>
                    Rasm
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{category.name}</p>
                {category.subcategory && category.subcategory.length > 0 ? (
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {category.subcategory.length} ta subkategoriya
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-0.5">subkategoriyasiz</p>
                )}
              </div>
              <div data-no-swipe className="flex items-center gap-1 shrink-0">
                <Button
                  onClick={() => handleEdit(category.id)}
                  variant={'ghost'}
                  size="icon"
                  className="size-8 cursor-pointer"
                  aria-label="Tahrirlash"
                >
                  <BiEdit size={18} />
                </Button>
                <Button
                  onClick={() => handleDelete(category)}
                  variant={'ghost'}
                  size="icon"
                  className="size-8 cursor-pointer text-red-500 hover:text-red-700"
                  aria-label="O'chirish"
                >
                  <BiTrash size={18} />
                </Button>
              </div>
            </div>
            {category.subcategory && category.subcategory.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-gray-100">
                {category.subcategory.slice(0, 6).map((tag: string, idx: number) => (
                  <span
                    key={idx}
                    className="rounded-md bg-gray-100 text-gray-700 px-2 py-0.5 text-[10px] font-medium"
                  >
                    {tag}
                  </span>
                ))}
                {category.subcategory.length > 6 && (
                  <span className="text-[10px] text-gray-400">+{category.subcategory.length - 6}</span>
                )}
              </div>
            )}
          </div>
        )))}
      </div>
    </div>
  )
}

export default CategoryTable