"use client"
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fireStorage } from "@/firebase/config";
import { ImageT, ProductT } from "@/lib/types";
import { sanitizeFilename } from "@/lib/sanitizeFilename";
import useCategoryStore from "@/store/useCategoryStore";
import useProductStore from "@/store/useProductStore";
import { FirebaseError } from "firebase/app";
import { Timestamp } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CgClose } from "react-icons/cg";
import { ImagePlus, Loader2 } from "lucide-react";
import { CategoryI } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

const emptyTimestamp = new Timestamp(0, 0);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const UpdateProductForm = ({ id }: { id: string }) => {
  const navigate = useRouter();
  const [imageUploading, setImageUploading] = useState(false);
  const [submitUploading, setSubmitUploading] = useState(false);
  const { product, loading, fetchSingleProduct, updateProduct } = useProductStore();
  const { categories, fetchCategories } = useCategoryStore();
  const [selectedCategory, setSelectedCategory] = useState<CategoryI | null>(null);

  const [updatedProduct, setUpdatedProduct] = useState<ProductT>({
    id: id || '',
    title: '',
    price: '0',
    productImageUrl: [] as ImageT[],
    category: '',
    description: '',
    quantity: 0,
    time: product?.time || emptyTimestamp,
    date: product?.date || emptyTimestamp,
    storageFileId: '',
    subcategory: '',
    stock: 1
  });

  useEffect(() => {
    if (id) fetchSingleProduct(id as string);
  }, [id, fetchSingleProduct]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  useEffect(() => {
    if (product) {
      setUpdatedProduct({
        id: product.id,
        title: product.title,
        price: product.price,
        productImageUrl: product.productImageUrl,
        category: product.category,
        description: product.description,
        quantity: product.quantity,
        time: product.time,
        date: product.date,
        storageFileId: product.storageFileId,
        subcategory: product.subcategory || '',
        stock: product.stock ?? 1,
        costPrice: product.costPrice ?? 0
      });
      const cat = categories.find(c => c.name === product.category);
      setSelectedCategory(cat || null);
    }
  }, [product, categories]);

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageUploading(true);

    let currentStorageFileId = updatedProduct.storageFileId;
    if (!currentStorageFileId) {
      currentStorageFileId = uuidv4();
      setUpdatedProduct((prev) => ({ ...prev, storageFileId: currentStorageFileId }));
    }

    try {
      const validFiles = Array.from(files).filter((f) => {
        if (!f.type.startsWith('image/')) {
          toast.error(`${f.name} rasm fayli emas`);
          return false;
        }
        if (f.size > MAX_FILE_BYTES) {
          toast.error(`${f.name} 10 MB dan katta`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) {
        setImageUploading(false);
        return;
      }

      const uploadPromises = validFiles.map(async (file) => {
        const safeName = sanitizeFilename(file.name);
        const storageRef = ref(fireStorage, `products/${currentStorageFileId}/${safeName}`);
        await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
        const downloadUrl = await getDownloadURL(storageRef);
        return { url: downloadUrl, path: storageRef.fullPath };
      });

      const imageUrls = await Promise.all(uploadPromises);
      setUpdatedProduct((prev) => ({
        ...prev,
        productImageUrl: [...prev.productImageUrl, ...imageUrls],
      }));
      toast.success(`${imageUrls.length} ta rasm yuklandi`);
    } catch (error) {
      console.error("Error uploading images:", error);
      if (error instanceof FirebaseError) {
        if (error.code === 'storage/unauthorized') toast.error("Ruxsat yo'q — admin sifatida kiring");
        else if (error.code === 'storage/quota-exceeded') toast.error("Xotira to'ldi — adminga murojaat qiling");
        else if (error.code === 'storage/retry-limit-exceeded') toast.error("Internet ulanishini tekshiring");
        else toast.error(`Rasmni yuklab bo'lmadi: ${error.code}`);
      } else {
        toast.error("Rasmlarni yuklashda xatolik yuz berdi");
      }
    } finally {
      setImageUploading(false);
    }
  };

  const handleDeleteImage = async (imageUrl: string) => {
    const fileName = imageUrl.split('/').pop();
    if (!fileName) return;
    const imageRef = ref(fireStorage, `products/${updatedProduct.storageFileId}/${fileName}`);
    try {
      await deleteObject(imageRef);
      setUpdatedProduct((prev) => ({
        ...prev,
        productImageUrl: prev.productImageUrl.filter((url) => url.path !== imageUrl),
      }));
      toast.success("Rasm o'chirildi");
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Rasmni o'chirishda xatolik yuz berdi");
    }
  };

  const handleCancel = () => navigate.back();

  const handleUpdate = async () => {
    if (!id) return;
    if (updatedProduct.title.trim() === '') return toast.error("Mahsulot nomini kiriting");
    if (!updatedProduct.price || Number(updatedProduct.price) <= 0) return toast.error("Sotish narxini kiriting");
    if (updatedProduct.productImageUrl.length === 0) return toast.error("Kamida bitta rasm yuklang");
    if (!updatedProduct.category) return toast.error("Kategoriyani tanlang");

    setSubmitUploading(true);
    try {
      await updateProduct(id, updatedProduct);
      toast.success('Mahsulot yangilandi');
      navigate.push('/admin/products');
    } catch (error) {
      console.error(error);
      toast.error("Mahsulotni yangilashda xatolik yuz berdi");
    } finally {
      setSubmitUploading(false);
    }
  };

  const fieldInput = "w-full h-12 rounded-xl text-brand-black-text border border-gray-200 bg-gray-50 focus:bg-white focus:border-black focus:outline-none focus:ring-2 focus:ring-black/5 placeholder:text-gray-400 px-4 text-sm sm:text-base font-normal transition";
  const fieldLabel = "text-brand-black-text text-sm sm:text-base font-semibold block mb-2";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-6 sm:py-8">
      <div className="mb-5 sm:mb-8">
        <h2 className="text-brand-black-text text-xl sm:text-2xl md:text-3xl font-bold leading-tight">
          Mahsulotni tahrirlash
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Mahsulot ma&apos;lumotlarini yangilang
        </p>
      </div>

      <div className="flex flex-col gap-5 sm:gap-6">
        {/* Images */}
        <section>
          <label className={fieldLabel}>Mahsulot rasmlari*</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
            {updatedProduct.productImageUrl.map((img, index) => (
              <div key={index} className="relative aspect-square overflow-hidden rounded-xl sm:rounded-2xl bg-gray-100 ring-1 ring-gray-200">
                <Image
                  className="object-cover"
                  src={img.url}
                  fill
                  sizes="(max-width: 640px) 33vw, 25vw"
                  alt={`product image ${index + 1}`}
                />
                <button
                  type="button"
                  aria-label="Rasmni o'chirish"
                  className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center size-7 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white shadow-md active:scale-95 transition"
                  onClick={() => handleDeleteImage(img.path)}
                >
                  <CgClose size={14} className="text-black" />
                </button>
              </div>
            ))}

            <label
              htmlFor="upload"
              className={`flex flex-col items-center justify-center gap-1.5 aspect-square rounded-xl sm:rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                imageUploading
                  ? 'border-gray-200 bg-gray-50 opacity-70 cursor-wait'
                  : 'border-gray-300 bg-gray-50 hover:border-black hover:bg-gray-100 active:scale-[0.98]'
              }`}
            >
              {imageUploading ? (
                <>
                  <Loader2 className="size-5 sm:size-6 text-gray-500 animate-spin" />
                  <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Yuklanmoqda</span>
                </>
              ) : (
                <>
                  <ImagePlus className="size-5 sm:size-6 text-gray-500" />
                  <span className="text-[10px] sm:text-xs text-gray-600 font-medium">Rasm qo&apos;shish</span>
                </>
              )}
            </label>
            <input
              className="sr-only"
              id="upload"
              type="file"
              multiple
              disabled={imageUploading}
              onChange={(e) => handleImageUpload(e.target.files)}
              accept="image/*"
            />
          </div>
          {updatedProduct.productImageUrl.length === 0 && (
            <p className="text-red-500 text-xs sm:text-sm mt-2">Kamida bitta rasm talab qilinadi</p>
          )}
        </section>

        {/* Product Name */}
        <div>
          <label htmlFor="p-title" className={fieldLabel}>Mahsulot nomi*</label>
          <input
            id="p-title"
            placeholder="Mahsulot nomi"
            className={fieldInput}
            value={updatedProduct.title}
            onChange={(e) => setUpdatedProduct({ ...updatedProduct, title: e.target.value })}
          />
        </div>

        {/* Category */}
        <div>
          <label className={fieldLabel}>Kategoriyani tanlang*</label>
          <Select
            value={updatedProduct.category || undefined}
            onValueChange={(value) => {
              setUpdatedProduct({ ...updatedProduct, category: value, subcategory: '' });
              const cat = categories.find(c => c.name === value);
              setSelectedCategory(cat || null);
            }}
          >
            <SelectTrigger className="w-full !h-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-black focus:ring-2 focus:ring-black/5 px-4 text-sm sm:text-base cursor-pointer">
              <SelectValue placeholder="Kategoriyani tanlang" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {categories.map(({ name, id }) => (
                <SelectItem className="capitalize" key={id} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory */}
        {selectedCategory && selectedCategory.subcategory && selectedCategory.subcategory.length > 0 && (
          <div>
            <label className={fieldLabel}>Subkategoriya tanlang*</label>
            <Select
              value={updatedProduct.subcategory || undefined}
              onValueChange={(value) => setUpdatedProduct({ ...updatedProduct, subcategory: value })}
            >
              <SelectTrigger className="w-full !h-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-black focus:ring-2 focus:ring-black/5 px-4 text-sm sm:text-base cursor-pointer">
                <SelectValue placeholder="Subkategoriya tanlang" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {selectedCategory.subcategory.map((sub: string, idx: number) => (
                  <SelectItem className="capitalize" key={idx} value={sub}>{sub}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Prices + Stock grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <div>
            <label htmlFor="cost" className={fieldLabel}>Tan narxi (so&apos;m)*</label>
            <input
              id="cost"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="0"
              className={fieldInput}
              value={updatedProduct.costPrice ?? ''}
              onChange={(e) => setUpdatedProduct({ ...updatedProduct, costPrice: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label htmlFor="price" className={fieldLabel}>Sotish narxi (so&apos;m)*</label>
            <input
              id="price"
              inputMode="numeric"
              placeholder="0"
              className={fieldInput}
              value={updatedProduct?.price}
              onChange={(e) => setUpdatedProduct({ ...updatedProduct, price: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="stock" className={fieldLabel}>Ombordagi soni*</label>
            <input
              id="stock"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="0"
              className={fieldInput}
              value={updatedProduct.stock ?? ''}
              onChange={(e) => setUpdatedProduct({ ...updatedProduct, stock: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="p-desc" className={fieldLabel}>Tavsif*</label>
          <textarea
            id="p-desc"
            placeholder="Mahsulot haqida batafsil ma'lumot"
            rows={4}
            className="w-full rounded-xl text-brand-black-text border border-gray-200 bg-gray-50 focus:bg-white focus:border-black focus:outline-none focus:ring-2 focus:ring-black/5 placeholder:text-gray-400 p-4 text-sm sm:text-base font-normal resize-none min-h-28 transition"
            value={updatedProduct.description}
            onChange={(e) => setUpdatedProduct({ ...updatedProduct, description: e.target.value })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 sm:gap-3 flex-col-reverse sm:flex-row sm:justify-end sticky bottom-0 sm:static pt-2 sm:pt-0 bg-white pb-[env(safe-area-inset-bottom)]">
          <Button
            type="button"
            variant="secondary"
            className="bg-gray-100 hover:bg-gray-200 text-brand-black-text rounded-xl h-12 px-6 cursor-pointer text-sm font-semibold tracking-wide w-full sm:w-auto"
            onClick={handleCancel}
            disabled={loading || submitUploading || imageUploading}
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            variant="default"
            className="flex items-center justify-center rounded-xl h-12 px-6 bg-black text-white hover:bg-gray-900 text-sm font-semibold tracking-wide w-full sm:w-auto cursor-pointer disabled:opacity-60"
            onClick={handleUpdate}
            disabled={loading || submitUploading || imageUploading}
          >
            {submitUploading ? 'Yuklanmoqda...' : 'Mahsulotni yangilash'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default UpdateProductForm
