"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";
import { useAuthStore, type UserData } from "@/store/authStore";
import useProductStore from "@/store/useProductStore";
import { useOrderStore } from "@/store/useOrderStore";
import { formatUZS } from "@/lib/formatPrice";
import { matchesSearch } from "@/lib/searchMatch";
import type { Order, ProductT } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Search,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  User,
  Phone,
  ShoppingCart,
  Package,
  Check,
  RotateCcw,
  Star,
} from "lucide-react";

interface OrderItem {
  product: ProductT;
  quantity: number;
}

export default function AdminQuickOrder() {
  const router = useRouter();

  const { users, fetchAllUsers } = useAuthStore();
  const { products, fetchProducts } = useProductStore();
  const { orders, createOrder, fetchAllOrders } = useOrderStore();

  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<UserData | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch all data on mount
  useEffect(() => {
    const unsubUsers = fetchAllUsers() as (() => void) | undefined;
    const unsubProducts = fetchProducts() as (() => void) | undefined;
    const unsubOrders = fetchAllOrders() as (() => void) | undefined;
    return () => {
      if (typeof unsubUsers === "function") unsubUsers();
      if (typeof unsubProducts === "function") unsubProducts();
      if (typeof unsubOrders === "function") unsubOrders();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce product search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedProductSearch(productSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Filter to actual CUSTOMERS only (Cyrillic ↔ Latin tolerant).
  // Previously filtered `role !== "admin"`, which leaked managers (internal
  // staff) into the customer picker — the admin would accidentally place a
  // "customer order" against a fellow staff member's UID, polluting their
  // order history and skewing customer-rank reports. Now require `role ===
  // "user"` (or missing/empty role for legacy accounts created before the
  // role field existed).
  const filteredUsers = useMemo(() => {
    const customers = users.filter((u) => !u.role || u.role === "user");
    if (customerSearch.length < 2) return customers;
    return customers.filter(
      (u) =>
        matchesSearch(u.name, customerSearch) ||
        (u.phone && u.phone.includes(customerSearch))
    );
  }, [users, customerSearch]);

  // Get last order for a user
  const getLastOrder = useCallback(
    (uid: string): Order | undefined => {
      return orders
        .filter((o) => o.userUid === uid)
        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))[0];
    },
    [orders]
  );

  // Check if user has any past orders
  const userHasOrders = useCallback(
    (uid: string): boolean => {
      return orders.some((o) => o.userUid === uid);
    },
    [orders]
  );

  // Repeat last order
  const repeatLastOrder = useCallback(
    (order: Order) => {
      setItems(
        order.basketItems.map((item) => ({
          product: item,
          quantity: item.quantity,
        }))
      );
      setStep(2);
    },
    []
  );

  // Get frequently ordered products for a user
  const getFrequentProducts = useCallback(
    (uid: string) => {
      const productCounts = new Map<string, { product: ProductT; count: number }>();
      for (const order of orders.filter((o) => o.userUid === uid)) {
        for (const item of order.basketItems) {
          const existing = productCounts.get(item.id) || {
            product: item,
            count: 0,
          };
          existing.count += item.quantity;
          productCounts.set(item.id, existing);
        }
      }
      return Array.from(productCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    },
    [orders]
  );

  // Filter products by search (Cyrillic ↔ Latin tolerant)
  const filteredProducts = useMemo(() => {
    if (debouncedProductSearch.length < 2) return products;
    return products.filter((p) => (
      matchesSearch(p.title, debouncedProductSearch) ||
      matchesSearch(p.category ?? '', debouncedProductSearch) ||
      matchesSearch(p.subcategory ?? '', debouncedProductSearch)
    ));
  }, [products, debouncedProductSearch]);

  // Select customer
  const handleSelectCustomer = (user: UserData) => {
    setSelectedCustomer(user);
    setStep(2);
  };

  // Add product to order
  const addProductToOrder = (product: ProductT) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  // Update item quantity
  const updateQuantity = (productId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  // Remove item
  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  // Totals
  const totalPrice = useMemo(
    () =>
      items.reduce(
        (sum, { product, quantity }) => sum + Number(product.price) * quantity,
        0
      ),
    [items]
  );

  const totalQuantity = useMemo(
    () => items.reduce((sum, { quantity }) => sum + quantity, 0),
    [items]
  );

  // Submit order — server validates stock + prices inside a transaction.
  const handleSubmit = async () => {
    if (!selectedCustomer || items.length === 0) return;
    setSubmitting(true);
    try {
      const result = await createOrder({
        items: items
          .filter(({ product }) => product.id)
          .map(({ product, quantity }) => ({ productId: product.id, quantity })),
        clientName: selectedCustomer.name,
        clientPhone: selectedCustomer.phone,
        targetUserUid: selectedCustomer.uid,
        totalPriceHint: totalPrice,
      });

      if (!result.ok) {
        if (result.status === 409 && result.stockErrors?.length) {
          const names = result.stockErrors
            .map((e) => e.title || e.productId)
            .slice(0, 3)
            .join(", ");
          toast.error(`Ombordagi mahsulot yetarli emas: ${names}`);
        } else if (result.status === 403) {
          toast.error("Faqat admin boshqalar uchun buyurtma yarata oladi");
        } else {
          toast.error(result.message || "Buyurtma yaratishda xatolik yuz berdi");
        }
        return;
      }

      if (result.priceChanged) {
        toast(`Narxlar yangilandi. Jami: ${formatUZS(result.totalPrice)}`);
      }

      toast.success("Buyurtma muvaffaqiyatli yaratildi!");
      router.push("/admin/orders");
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error("Buyurtma yaratishda xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  // Frequent products for selected customer
  const frequentProducts = useMemo(() => {
    if (!selectedCustomer) return [];
    return getFrequentProducts(selectedCustomer.uid);
  }, [selectedCustomer, getFrequentProducts]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => {
              if (step > 1) setStep(step - 1);
              else router.push("/admin/orders");
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="size-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">
              Yangi buyurtma yaratish
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className={`size-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      s < step
                        ? "bg-green-500 text-white"
                        : s === step
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {s < step ? <Check className="size-3.5" /> : s}
                  </div>
                  <span
                    className={`text-xs hidden sm:inline ${
                      s === step
                        ? "text-gray-900 font-medium"
                        : "text-gray-400"
                    }`}
                  >
                    {s === 1
                      ? "Mijoz"
                      : s === 2
                      ? "Mahsulotlar"
                      : "Tasdiqlash"}
                  </span>
                  {s < 3 && (
                    <div className="w-6 h-px bg-gray-300 hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Step 1: Select Customer */}
        {step === 1 && (
          <div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input
                type="text"
                placeholder="Mijozni qidirish (ism yoki telefon)..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Mijoz topilmadi
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const hasOrders = userHasOrders(user.uid);
                  const lastOrder = hasOrders
                    ? getLastOrder(user.uid)
                    : undefined;
                  return (
                    <div
                      key={user.uid}
                      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => handleSelectCustomer(user)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="size-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <User className="size-5 text-blue-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="size-3" />
                              {user.phone || "Telefon yo'q"}
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {lastOrder && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(user);
                                repeatLastOrder(lastOrder);
                              }}
                              className="text-xs gap-1.5"
                            >
                              <RotateCcw className="size-3.5" />
                              <span className="hidden sm:inline">Oxirgi buyurtma</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleSelectCustomer(user)}
                            className="text-xs gap-1.5"
                          >
                            Tanlash
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Step 2: Add Products */}
        {step === 2 && (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Product selection */}
            <div className="flex-1 min-w-0">
              {/* Selected customer info */}
              {selectedCustomer && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
                  <User className="size-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-900">
                    {selectedCustomer.name}
                  </span>
                  <span className="text-xs text-blue-600">
                    {selectedCustomer.phone}
                  </span>
                </div>
              )}

              {/* Frequently ordered */}
              {frequentProducts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Star className="size-4 text-amber-500" />
                    Tez-tez buyuriladigan
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {frequentProducts.map(({ product, count }) => {
                      const isInOrder = items.some(
                        (i) => i.product.id === product.id
                      );
                      return (
                        <button
                          key={product.id}
                          onClick={() => addProductToOrder(product)}
                          className={`relative bg-white rounded-lg border p-3 text-left hover:border-blue-300 transition-all ${
                            isInOrder
                              ? "border-blue-400 ring-1 ring-blue-100"
                              : "border-gray-200"
                          }`}
                        >
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {product.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatUZS(product.price)}
                          </p>
                          <span className="text-[10px] text-amber-600 mt-1 block">
                            {count} marta
                          </span>
                          {isInOrder && (
                            <div className="absolute top-1.5 right-1.5 size-4 bg-blue-500 rounded-full flex items-center justify-center">
                              <Check className="size-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Product search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Mahsulot qidirish..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              {/* Product grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-400 text-sm">
                    Mahsulot topilmadi
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const isInOrder = items.some(
                      (i) => i.product.id === product.id
                    );
                    const orderItem = items.find(
                      (i) => i.product.id === product.id
                    );
                    return (
                      <button
                        key={product.id}
                        onClick={() => addProductToOrder(product)}
                        className={`relative bg-white rounded-xl border p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all flex items-center gap-3 ${
                          isInOrder
                            ? "border-blue-400 ring-1 ring-blue-100"
                            : "border-gray-200"
                        }`}
                      >
                        {/* Product image */}
                        <div className="size-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 relative">
                          {product.productImageUrl &&
                          product.productImageUrl.length > 0 ? (
                            <Image
                              src={product.productImageUrl[0].url}
                              alt={product.title}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          ) : (
                            <div className="size-full flex items-center justify-center">
                              <Package className="size-5 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {product.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {product.category}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">
                            {formatUZS(product.price)}
                          </p>
                        </div>
                        {isInOrder && orderItem && (
                          <div className="shrink-0 bg-blue-500 text-white text-xs font-bold rounded-full size-6 flex items-center justify-center">
                            {orderItem.quantity}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Order items */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="lg:sticky lg:top-24">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ShoppingCart className="size-4" />
                      Buyurtma ({items.length})
                    </h3>
                  </div>

                  {items.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">
                      Mahsulot tanlang
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                      {items.map(({ product, quantity }) => (
                        <div
                          key={product.id}
                          className="px-4 py-3 flex items-center gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900 truncate">
                              {product.title}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatUZS(
                                Number(product.price) * quantity
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                updateQuantity(product.id, -1)
                              }
                              className="size-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                            >
                              <Minus className="size-3.5 text-gray-600" />
                            </button>
                            <span className="text-sm font-medium w-6 text-center">
                              {quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(product.id, 1)
                              }
                              className="size-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                            >
                              <Plus className="size-3.5 text-gray-600" />
                            </button>
                            <button
                              onClick={() => removeItem(product.id)}
                              className="size-7 rounded-md flex items-center justify-center hover:bg-red-50 transition-colors ml-1"
                            >
                              <Trash2 className="size-3.5 text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer with totals */}
                  <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Jami mahsulot:</span>
                      <span className="font-medium">{totalQuantity} dona</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Jami summa:</span>
                      <span className="font-semibold text-gray-900">
                        {formatUZS(totalPrice)}
                      </span>
                    </div>
                    <Button
                      className="w-full mt-3 gap-2"
                      disabled={items.length === 0}
                      onClick={() => setStep(3)}
                    >
                      Keyingi
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && selectedCustomer && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">
                  Buyurtma tasdiqlash
                </h3>
              </div>

              {/* Customer info */}
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <User className="size-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedCustomer.name}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone className="size-3" />
                      {selectedCustomer.phone}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="divide-y divide-gray-100">
                {items.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="px-6 py-3 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">
                        {product.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatUZS(product.price)} x {quantity}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-gray-900 shrink-0 ml-4">
                      {formatUZS(Number(product.price) * quantity)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Jami mahsulot:</span>
                  <span className="font-medium">{totalQuantity} dona</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-gray-700 font-medium">
                    Jami summa:
                  </span>
                  <span className="font-bold text-gray-900">
                    {formatUZS(totalPrice)}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <div className="px-6 py-4 border-t border-gray-100">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(2)}
                  >
                    <ArrowLeft className="size-4" />
                    Orqaga
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Buyurtma yaratish
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
