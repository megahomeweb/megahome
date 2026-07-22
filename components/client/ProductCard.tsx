import { formatUZS } from '@/lib/formatPrice'
import { ProductT } from '@/lib/types'
import Image from 'next/image'
import React from 'react'
import { useAuthStore } from '@/store/authStore'
import Link from 'next/link'
import WishlistButton from './WishlistButton'
import ShareButton from './ShareButton'
import { Package } from 'lucide-react'

interface ProductProps {
  product: ProductT
}

const ProductCard = ({product}: ProductProps) => {
  // Subscribing to userData (not just the helper fns) so the card
  // re-renders the moment the admin approves the prospect.
  const { isAuthenticated, canSeePrices, isProspect } = useAuthStore();
  const showPrice = canSeePrices();
  const prospect = isProspect();

  const hasStock = product.stock !== undefined && product.stock !== null;
  const outOfStock = hasStock && (product.stock as number) <= 0;

  return (
    <Link
      href={`/product/${product.id}`}
      className={`group block rounded-2xl overflow-hidden bg-white border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300 ${outOfStock ? 'opacity-60' : ''}`}
    >
      {/* Image container */}
      <div className='relative aspect-square overflow-hidden bg-gray-50'>
        {product.productImageUrl && product.productImageUrl.length > 0 ? (
          <Image
            src={product.productImageUrl[0].url}
            alt={product.title}
            fill
            className='object-cover group-hover:scale-105 transition-transform duration-500'
          />
        ) : (
          <div className='absolute inset-0 flex flex-col items-center justify-center text-gray-300'>
            <Package className='size-10 mb-1' />
            <span className='text-xs'>Rasm yo&apos;q</span>
          </div>
        )}

        {/* Stock badges */}
        {outOfStock ? (
          <div className='absolute top-2.5 left-2.5 bg-red-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg z-10'>
            Mavjud emas
          </div>
        ) : hasStock && (product.stock as number) <= 10 ? (
          <div className='absolute top-2.5 left-2.5 bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg z-10'>
            {product.stock} ta qoldi
          </div>
        ) : null}

        {/* Action buttons — always visible on mobile, hover on desktop */}
        <div className='absolute top-2.5 right-2.5 flex flex-col gap-1.5 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200'>
          <WishlistButton productId={product.id} className='bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-sm hover:bg-white transition-colors' />
          <ShareButton product={{ title: product.title, price: product.price, id: product.id }} className='bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-sm hover:bg-white transition-colors' />
        </div>
      </div>

      {/* Info */}
      <div className='p-3 sm:p-4'>
        <h3 className='font-semibold text-sm sm:text-base text-gray-900 line-clamp-1 mb-1'>
          {product.title}
        </h3>
        {showPrice ? (
          <p className='font-bold text-[#00bad8] text-sm sm:text-base'>
            {formatUZS(product.price)}
          </p>
        ) : prospect ? (
          <p className='text-xs font-medium text-amber-600'>
            Narx tasdiqlangach ochiladi
          </p>
        ) : !isAuthenticated ? (
          <p className='text-xs text-gray-400'>
            Narxni ko&apos;rish uchun kiring
          </p>
        ) : (
          // Authenticated but profile doc still loading — neutral placeholder
          <p className='text-xs text-gray-300'>—</p>
        )}
      </div>
    </Link>
  )
}

export default ProductCard
