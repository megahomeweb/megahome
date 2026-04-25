"use client";
import useCartProductStore from "@/store/useCartStore";
import { useOrderStore } from "@/store/useOrderStore";
import { useRouter } from "next/navigation";
import React, { Dispatch, SetStateAction, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/store/authStore";
import { formatUZS } from "@/lib/formatPrice";
import { auth } from "@/firebase/config";

type PaymentMethod = 'naqd' | 'karta' | 'bank';
import { telegramNotify } from "@/lib/telegram/notify-client";

interface props {
  setOpen: Dispatch<SetStateAction<boolean>>;
}

interface OrderFormData {
  firstName: string;
  phoneNumber: string;
  deliveryAddress: string;
  orderNote: string;
  paymentMethod: PaymentMethod;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd (yetkazishda)" },
  { value: "karta", label: "Karta orqali" },
  { value: "bank", label: "Bank o\u2018tkazmasi" },
];

const SubmitModal = ({ setOpen }: props) => {
  const [loading, setLoading] = useState(false);
  const { cartProducts, totalPrice, totalQuantity, clearBasket } = useCartProductStore();
  const { createOrder } = useOrderStore();
  const navigate = useRouter();
  const { userData } = useAuthStore();
  
  // React Hook Form setup
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    watch
  } = useForm({
    defaultValues: {
      firstName: userData?.name || "",
      phoneNumber: userData?.phone || "",
      deliveryAddress: "",
      orderNote: "",
      paymentMethod: "naqd" as PaymentMethod,
    }
  });

  // Phone number formatting (from SignUpForm)
  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.startsWith("998")) {
      value = value.slice(3);
    }
    value = value.slice(0, 9);
    if (!value) {
      setValue("phoneNumber", "");
      return;
    }
    const formattedValue = value
      ? `+998 (${value.slice(0, 2)}${value.length > 2 ? ")" : ""}${value.length > 2 ? " " : ""}${value.slice(2, 5)}${value.length > 5 ? "-" : ""}${value.slice(5, 7)}${value.length > 7 ? "-" : ""}${value.slice(7)}`
      : "";
    setValue("phoneNumber", formattedValue);
  };

  // Form submit — server validates prices + stock, then creates the order.
  const onSubmit = async (data: OrderFormData) => {
    if (cartProducts.length === 0) {
      return toast.error("Savat bo'sh.");
    }

    setLoading(true);
    try {
      const result = await createOrder({
        items: cartProducts
          .filter((p) => p.id)
          .map((p) => ({ productId: p.id, quantity: p.quantity })),
        clientName: data.firstName,
        clientPhone: data.phoneNumber,
        deliveryAddress: data.deliveryAddress.trim() || undefined,
        orderNote: data.orderNote.trim() || undefined,
        paymentMethod: data.paymentMethod,
        totalPriceHint: totalPrice,
      });

      if (!result.ok) {
        if (result.status === 409 && result.stockErrors?.length) {
          const names = result.stockErrors
            .map((e) => e.title || e.productId)
            .slice(0, 3)
            .join(', ');
          toast.error(`Ombordagi mahsulot yetarli emas: ${names}`);
        } else if (result.status === 401) {
          toast.error("Avval tizimga kiring");
        } else {
          toast.error(result.message || "Buyurtma yaratilmadi");
        }
        return;
      }

      if (result.priceChanged) {
        toast(`Narxlar yangilandi. Jami: ${formatUZS(result.totalPrice)}`);
      }

      // Fire-and-forget: email + Telegram notifications.
      // We send only orderId — server reads real order data from Firestore
      // and verifies the caller owns it (or is staff). Closes the previous
      // spam-relay vulnerability where a malicious user could POST any
      // body and the server would email it as-is.
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        fetch('/api/sendOrderEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ orderId: result.orderId }),
        }).catch(() => {});
      }
      telegramNotify('order_placed', {
        orderId: result.orderId,
        clientName: data.firstName,
        clientPhone: data.phoneNumber,
        totalPrice: result.totalPrice,
        totalQuantity: result.totalQuantity,
        userUid: userData?.uid || '',
        basketItems: result.basketItems.map((i) => ({ title: i.title, quantity: i.quantity })),
      });

      clearBasket();
      toast.success("Buyurtma muvaffaqiyatli qo'shildi");
      navigate.push("/");
    } catch (error) {
      console.error(error);
      toast.error("Buyurtma qo'shilmadi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed z-99 w-full h-full inset-0 flex items-center justify-center">
      <div
        onClick={() => setOpen(false)}
        className="absolute inset-0 size-full bg-black/80 z-0"
      ></div>
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-md w-full bg-white rounded-md space-y-3 p-5 z-10 max-h-[90vh] overflow-y-auto">
        {/* Order summary */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4">
          <p className="text-sm font-bold text-gray-900 mb-2">Buyurtma ({totalQuantity} ta mahsulot)</p>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {cartProducts.slice(0, 5).map((item, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-600">
                <span className="truncate mr-2">{item.title} x{item.quantity}</span>
                <span className="shrink-0">{formatUZS(Number(item.price) * item.quantity)}</span>
              </div>
            ))}
            {cartProducts.length > 5 && <p className="text-xs text-gray-400">... va yana {cartProducts.length - 5} ta</p>}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-gray-200 font-bold text-sm">
            <span>Jami:</span>
            <span className="text-green-600">{formatUZS(totalPrice)}</span>
          </div>
        </div>

        <div>
          <label htmlFor="first-name" className="block text-sm font-medium text-gray-900">Ism</label>
          <div className="mt-1">
            <input
              id="first-name"
              type="text"
              autoComplete="given-name"
              className={`block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:outline-none focus:ring-inset focus:ring-indigo-600 sm:text-sm px-2 ${errors.firstName ? 'border-red-500 border-2' : ''}`}
              {...register("firstName", {
                required: "Ism majburiy kiritilishi kerak",
                minLength: { value: 2, message: "Ism kamida 2 ta belgidan iborat bo'lishi kerak" },
                pattern: { value: /^[A-Za-z\u0400-\u04FF\u2018\u2019'\s]+$/, message: "Ism faqat harflar va bo'sh joylardan iborat bo'lishi mumkin" }
              })}
            />
            {errors.firstName && <span className="text-red-500 text-sm mt-1">{errors.firstName.message as string}</span>}
          </div>
        </div>
        <div>
          <label htmlFor="phone-number" className="block text-sm font-medium text-gray-900">Telefon</label>
          <div className="mt-1">
            <input
              id="phone-number"
              type="text"
              placeholder="+998 (__) ___-__-__"
              className={`block w-full rounded-md border-0 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:outline-none focus:ring-inset focus:ring-indigo-600 sm:text-sm px-2 ${errors.phoneNumber ? 'border-red-500 border-2' : ''}`}
              value={watch("phoneNumber")}
              {...register("phoneNumber", {
                required: "Telefon raqami majburiy kiritilishi kerak",
                validate: (value) => {
                  const digits = value.replace(/\D/g, "");
                  return digits.length === 12 || "Telefon raqami kod bilan birga 12 ta raqamdan iborat bo'lishi kerak";
                }
              })}
              onChange={handlePhoneNumberChange}
              maxLength={20}
            />
            {errors.phoneNumber && <span className="text-red-500 text-sm mt-1">{errors.phoneNumber.message as string}</span>}
          </div>
        </div>
        {/* Delivery address */}
        <div>
          <label htmlFor="delivery-address" className="block text-sm font-medium text-gray-900">
            Yetkazish manzili
          </label>
          <div className="mt-1">
            <textarea
              id="delivery-address"
              rows={2}
              placeholder="Shahar, tuman, ko'cha, uy raqami..."
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:outline-none focus:ring-inset focus:ring-indigo-600 sm:text-sm px-2 resize-none"
              {...register("deliveryAddress")}
            />
          </div>
        </div>

        {/* Order notes */}
        <div>
          <label htmlFor="order-note" className="block text-sm font-medium text-gray-900">
            Buyurtma uchun izoh
          </label>
          <div className="mt-1">
            <textarea
              id="order-note"
              rows={2}
              placeholder="Maxsus ko'rsatmalar, yetkazish vaqti..."
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:outline-none focus:ring-inset focus:ring-indigo-600 sm:text-sm px-2 resize-none"
              {...register("orderNote")}
            />
          </div>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            To&apos;lov usuli
          </label>
          <div className="space-y-2">
            {PAYMENT_METHODS.map((method) => (
              <label
                key={method.value}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  watch("paymentMethod") === method.value
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  value={method.value}
                  className="accent-indigo-600"
                  {...register("paymentMethod")}
                />
                <span className="text-sm text-gray-800">{method.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="pt-3">
          <Button
            variant={"default"}
            type="submit"
            className="cursor-pointer h-12 bg-black transition-all ease-in-out rounded-xl max-w-lg w-full text-white p-2"
            disabled={loading}
          >
            {loading ? <span>Yuborilmoqda...</span> : "Buyurtmani Yuborish"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default SubmitModal;
