import useCartProductStore from "@/store/useCartStore";
import React from "react";
import { HiMinus } from "react-icons/hi";
import { LuPlus } from "react-icons/lu";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";

const Quantity = ({id}: {id: string}) => {
  const { cartProducts, incrementQuantity, decrementQuantity, getItemQuantity, calculateTotals } = useCartProductStore();
  const quantityInBasket = getItemQuantity(id);
  const router = useRouter();

  // Get stock from the cart item — undefined = no limit (pre-stock product)
  const cartItem = cartProducts.find((item) => item.id === id);
  const hasStock = cartItem?.stock !== undefined && cartItem?.stock !== null;
  const stock = hasStock ? (cartItem.stock as number) : 999;

  const handleAddQuantity = () => {
    if (quantityInBasket >= stock) return;
    incrementQuantity(id);
    calculateTotals();
  };

  const handleDeleteQuantity = () => {
    decrementQuantity(id);
    calculateTotals();
  };

  return (
    <div className="ml-auto rounded-xl border border-gray-300 flex items-center gap-3 sm:gap-5 w-fit py-1.5 px-2">
      <Button
        variant={'outline'}
        onClick={handleDeleteQuantity}
        disabled={quantityInBasket == 0}
        aria-label="Kamaytirish"
        className="cursor-pointer size-11 bg-gray-200 flex items-center justify-center rounded-full"
      >
        <HiMinus className="text-black" />
      </Button>
      <div className="w-14 border-b">
        <span className="block text-center tabular-nums">{quantityInBasket}</span>
      </div>
      <Button
        onClick={handleAddQuantity}
        disabled={quantityInBasket >= stock}
        aria-label="Ko'paytirish"
        className="cursor-pointer size-11 bg-black text-white flex items-center justify-center rounded-full disabled:opacity-40"
      >
        <LuPlus className="text-white" />
      </Button>
    </div>
  );
};

export default Quantity;
