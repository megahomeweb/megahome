
"use client";
import useProductStore from "@/store/useProductStore";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Image from "next/image";
import { formatUZS } from "@/lib/formatPrice";
import useCartProductStore from "@/store/useCartStore";
import { Button } from "../ui/button";
import { useAuthStore } from "@/store/authStore";
import {
  ShoppingCart, Plus, Minus, ChevronLeft, ChevronRight,
  Package, Truck, ShieldCheck
} from "lucide-react";

const ProductItem = ({ id }: { id: string }) => {
  const { fetchSingleProduct, loading, product } = useProductStore();
  const { addToBasket, getItemQuantity, load, calculateTotals } = useCartProductStore();
  const [quantity, setQuantity] = useState(1);
  const { isAuthenticated } = useAuthStore();
  const [currentImg, setCurrentImg] = useState(0);
  const navigate = useRouter();
  const quantityInBasket = getItemQuantity(id);

  // Fetch the product when `id` changes. We deliberately do NOT depend on
  // `quantityInBasket` — the previous version did, which meant every
  // basket change kicked the qty input back to whatever was in the
  // basket, overwriting whatever the user just typed. Quantity is purely
  // user-controlled local state from here.
  useEffect(() => {
    if (id) {
      fetchSingleProduct(id as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="size-8 border-2 border-gray-300 border-t-[#00bad8] rounded-full animate-spin" />
          <span className="text-sm">Yuklanmoqda...</span>
        </div>
      </div>
    );
  }

  const images = product.productImageUrl || [];
  const hasStock = product?.stock !== undefined && product?.stock !== null;
  const stock = hasStock ? (product.stock as number) : 999;

  const handleAddQuantity = () => {
    if (quantity < stock) setQuantity(quantity + 1);
  };

  const handleDeleteQuantity = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  const handleSubmit = async () => {
    if (hasStock && quantity > stock) {
      return toast.error(`Omborda faqat ${stock} ta mavjud`);
    }
    // Validate against existing in-cart total too — the cart store now
    // SUMS, so adding here pushes total past stock.
    if (hasStock && (quantityInBasket + quantity) > stock) {
      return toast.error(`Savatchada ${quantityInBasket} ta mavjud · Omborda faqat ${stock} ta`);
    }
    addToBasket({ ...product, quantity });
    calculateTotals();
    toast.success("Mahsulot savatga qo'shildi!");
    // Push to cart instead of navigate.back() — back() exits the site
    // when the user landed via a deeplink (no navigation history),
    // and even when there IS history the user expects to see their cart.
    navigate.push("/cart-product");
  };

  const handlePrev = () => {
    setCurrentImg((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };
  const handleNext = () => {
    setCurrentImg((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14">
      {/* ══════ IMAGE GALLERY ══════ */}
      <div className="space-y-3">
        {/* Main image */}
        <div className="relative rounded-2xl overflow-hidden bg-gray-50 aspect-square">
          {images.length > 0 ? (
            <>
              <Image
                fill
                src={images[currentImg].url}
                alt={product.title}
                className="object-cover transition-all duration-500"
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-gray-700 p-2.5 rounded-full z-10 shadow-sm hover:bg-white transition-colors cursor-pointer"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-gray-700 p-2.5 rounded-full z-10 shadow-sm hover:bg-white transition-colors cursor-pointer"
                    aria-label="Next image"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
              <Package className="size-16 mb-2" />
              <span className="text-sm">Rasm mavjud emas</span>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentImg(idx)}
                className={`relative flex-shrink-0 size-16 sm:size-20 rounded-xl overflow-hidden cursor-pointer transition-all ${
                  idx === currentImg
                    ? 'ring-2 ring-[#00bad8] ring-offset-2'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                <Image
                  src={img.url}
                  alt={`${product.title} - ${idx + 1}`}
                  fill
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══════ PRODUCT INFO ══════ */}
      <div className="flex flex-col">
        {/* Category badge */}
        {product.category && (
          <span className="text-sm text-[#00bad8] font-medium mb-2">
            {product.category}
            {product.subcategory && ` / ${product.subcategory}`}
          </span>
        )}

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
          {product.title}
        </h1>

        {product.description && (
          <p className="text-gray-500 leading-relaxed mb-6">
            {product.description}
          </p>
        )}

        {/* Price */}
        <div className="bg-gray-50 rounded-2xl p-5 mb-6">
          {isAuthenticated ? (
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Narxi</p>
                <p className="text-3xl font-bold text-gray-900">
                  {formatUZS(Number(product.price) * quantity)}
                </p>
                {quantity > 1 && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {formatUZS(product.price)} x {quantity} ta
                  </p>
                )}
              </div>
              {hasStock && (
                stock > 0 ? (
                  <div className={`text-right ${stock <= 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                    <p className="text-sm text-gray-400">Omborda</p>
                    <p className="text-lg font-bold">{stock} ta</p>
                  </div>
                ) : (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700">
                    Mavjud emas
                  </span>
                )
              )}
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-gray-500 mb-1">Narxni ko&apos;rish uchun</p>
              <p className="font-bold text-[#00bad8]">Ro&apos;yxatdan o&apos;ting</p>
            </div>
          )}
        </div>

        {/* Quantity selector */}
        <div className="flex items-center gap-4 mb-6">
          <span className="text-sm font-medium text-gray-700">Miqdori:</span>
          <div className="flex items-center gap-0 rounded-xl border border-gray-200 overflow-hidden">
            <Button
              variant="ghost"
              onClick={handleDeleteQuantity}
              disabled={quantity <= 1}
              className="size-11 rounded-none border-r border-gray-200 cursor-pointer"
            >
              <Minus className="size-4" />
            </Button>
            <div className="w-14 h-11 flex items-center justify-center text-base font-semibold">
              {quantity}
            </div>
            <Button
              variant="ghost"
              onClick={handleAddQuantity}
              disabled={quantity >= stock}
              className="size-11 rounded-none border-l border-gray-200 cursor-pointer"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {/* Add to cart button */}
        <Button
          onClick={handleSubmit}
          disabled={loading || load || !isAuthenticated || (hasStock && stock <= 0)}
          className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white text-base font-bold transition-all cursor-pointer disabled:opacity-50 gap-2.5"
        >
          {load ? (
            <span>Yuklanmoqda...</span>
          ) : !isAuthenticated ? (
            <span>Iltimos, ro&apos;yxatdan o&apos;ting</span>
          ) : (hasStock && stock <= 0) ? (
            <span>Mavjud emas</span>
          ) : (
            <>
              <ShoppingCart className="size-5" />
              <span>Savatga qo&apos;shish</span>
            </>
          )}
        </Button>

        {/* Trust indicators */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50">
            <Truck className="size-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500">Tez yetkazish</span>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50">
            <ShieldCheck className="size-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500">Sifat kafolati</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductItem;
