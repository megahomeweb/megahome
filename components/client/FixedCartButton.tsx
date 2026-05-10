"use client"

import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import React from 'react';
import { Button } from '../ui/button';
import { ShoppingCart } from 'lucide-react';
import useCartProductStore from '@/store/useCartStore';
import toast from 'react-hot-toast';

export default function FixedCartButton() {
  const { cartProducts } = useCartProductStore();
  const pathname = usePathname();

  // navigate
  const navigate = useRouter();

  const handleNavigate = () => {
    if(cartProducts.length > 0){
      navigate.push("/cart-product")
    }else{
      toast(() => (
        <span>Iltimos avval savatga mahsulot qo‘shing.</span>
      ));
    }
  }

  // Agar cart-product sahifasida bo'lsa, buttonni ko'rsatmaymiz
  if (pathname === '/cart-product') return null;

  return (
    <Button
      onClick={handleNavigate}
      style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
      className="fixed right-6 cursor-pointer size-16 z-50 bg-black shadow-lg rounded-full p-4 flex items-center justify-center transition-colors"
      aria-label="Savatcha"
      variant={"default"}
    >
      <ShoppingCart className='size-6 text-white' />
      <span className='flex items-center justify-center absolute -top-0.5 -right-0.5 bg-rose-500 size-5 rounded-full text-xs text-white'>{cartProducts.length}</span>
    </Button>
  );
} 