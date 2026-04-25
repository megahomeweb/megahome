"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuthStore, type UserData } from "@/store/authStore";
import useProductStore from "@/store/useProductStore";
import { useOrderStore } from "@/store/useOrderStore";
import { formatUZS, formatNumber } from "@/lib/formatPrice";
import { matchesSearch } from "@/lib/searchMatch";
import type { ProductT, Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Search,
  X,
  Plus,
  Minus,
  ShoppingCart,
  Package,
  Check,
  User,
  Phone,
  Trash2,
  ChevronDown,
  ChevronUp,
  Wallet,
  Clock3,
  Layers,
  Send,
  RotateCcw,
  AlertCircle,
  Receipt,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CartLine {
  product: ProductT;
  quantity: number;
}

type Tender = {
  cash: number;
  nasiya: number;
  nasiyaDueDate?: string; // YYYY-MM-DD
};

type Stage = "shopping" | "tender" | "success";

interface SuccessInfo {
  orderId: string;
  total: number;
  netTotal: number;
  cashGiven: number;
  change: number;
  method: "naqd" | "nasiya" | "aralash";
  customerName: string;
  customerPhone: string;
  itemCount: number;
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────

export default function PosScreen() {
  const router = useRouter();
  const { users, fetchAllUsers } = useAuthStore();
  const { products, fetchProducts } = useProductStore();
  const { orders, createOrder, fetchAllOrders } = useOrderStore();

  // Subscribe once on mount, clean up on unmount.
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

  // ── Ticket state ─────────────────────────────────────────
  const [customer, setCustomer] = useState<UserData | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState<{ type: "pct" | "abs"; value: number }>({ type: "pct", value: 0 });

  // ── Sheet visibility ─────────────────────────────────────
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("shopping");

  // ── Search ───────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(productSearch.trim()), 200);
    return () => clearTimeout(t);
  }, [productSearch]);

  // ── Submission state ─────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  // ─────────────────────────────────────────────────────────
  // Derived data
  // ─────────────────────────────────────────────────────────

  const filteredCustomers = useMemo(() => {
    const nonAdmins = users.filter((u) => u.role !== "admin");
    return nonAdmins;
  }, [users]);

  // Outstanding nasiya balance per customer — derived from orders with paymentBreakdown.
  // Future: replace with live read from `nasiya` collection.
  const balanceByUid = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      if (o.status === "bekor_qilindi") continue;
      const breakdown = (o as Order & { paymentBreakdown?: Array<{ method: string; amount: number }> }).paymentBreakdown;
      if (!breakdown) continue;
      for (const e of breakdown) {
        if (e.method === "nasiya") {
          m.set(o.userUid, (m.get(o.userUid) ?? 0) + e.amount);
        }
      }
    }
    return m;
  }, [orders]);

  const filteredProducts = useMemo(() => {
    if (debouncedSearch.length < 1) return products.slice(0, 60);
    return products.filter(
      (p) =>
        matchesSearch(p.title, debouncedSearch) ||
        matchesSearch(p.category ?? "", debouncedSearch) ||
        matchesSearch(p.subcategory ?? "", debouncedSearch),
    );
  }, [products, debouncedSearch]);

  // Frequents = top 8 products by recent sales count overall.
  const frequents = useMemo(() => {
    const counts = new Map<string, { product: ProductT; count: number }>();
    for (const o of orders.slice(0, 60)) {
      for (const it of o.basketItems ?? []) {
        const live = products.find((p) => p.id === it.id);
        if (!live) continue;
        const prev = counts.get(it.id) || { product: live, count: 0 };
        prev.count += it.quantity;
        counts.set(it.id, prev);
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [orders, products]);

  // ── Customer-specific frequents (when a customer is selected)
  const customerFrequents = useMemo(() => {
    if (!customer) return [];
    const counts = new Map<string, { product: ProductT; count: number }>();
    for (const o of orders.filter((x) => x.userUid === customer.uid)) {
      for (const it of o.basketItems ?? []) {
        const live = products.find((p) => p.id === it.id);
        if (!live) continue;
        const prev = counts.get(it.id) || { product: live, count: 0 };
        prev.count += it.quantity;
        counts.set(it.id, prev);
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [orders, products, customer]);

  // ── Cart math ────────────────────────────────────────────
  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0),
    [cart],
  );
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  const discountAmount = useMemo(() => {
    if (!discount.value) return 0;
    if (discount.type === "pct") return Math.round(subtotal * (discount.value / 100));
    return Math.min(Math.round(discount.value), subtotal);
  }, [discount, subtotal]);

  const netTotal = subtotal - discountAmount;
  const customerBalance = customer ? balanceByUid.get(customer.uid) ?? 0 : 0;

  // ─────────────────────────────────────────────────────────
  // Cart actions
  // ─────────────────────────────────────────────────────────
  const addProduct = useCallback((product: ProductT) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, quantity: Math.max(0, Math.floor(qty)) } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const incQty = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === productId
            ? { ...l, quantity: Math.max(0, l.quantity + delta) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const repeatLastOrderForCustomer = useCallback(
    (uid: string) => {
      const last = orders
        .filter((o) => o.userUid === uid && o.status !== "bekor_qilindi")
        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))[0];
      if (!last) {
        toast.error("Mijozda oldingi buyurtma yoʻq");
        return;
      }
      const lines: CartLine[] = [];
      for (const it of last.basketItems ?? []) {
        const live = products.find((p) => p.id === it.id);
        if (live) lines.push({ product: live, quantity: it.quantity });
      }
      if (lines.length === 0) {
        toast.error("Oldingi buyurtmadagi mahsulotlar mavjud emas");
        return;
      }
      setCart(lines);
      toast.success(`${lines.length} ta mahsulot qoʻshildi`);
    },
    [orders, products],
  );

  const resetTicket = useCallback(() => {
    setCart([]);
    setCustomer(null);
    setDiscount({ type: "pct", value: 0 });
    setProductSearch("");
    setStage("shopping");
    setCartSheetOpen(false);
    setCustomerSheetOpen(false);
    setSuccessInfo(null);
  }, []);

  // ─────────────────────────────────────────────────────────
  // Submit (commit sale)
  // ─────────────────────────────────────────────────────────
  const commitSale = useCallback(
    async (tender: Tender) => {
      if (cart.length === 0) return;
      if (tender.cash + tender.nasiya !== netTotal) {
        toast.error("Toʻlov yigʻindisi summa bilan mos kelmadi");
        return;
      }
      if (tender.nasiya > 0 && !customer) {
        toast.error("Nasiya uchun mijoz kerak");
        return;
      }
      setSubmitting(true);
      try {
        const breakdown: Array<{
          method: "naqd" | "nasiya" | "karta";
          amount: number;
          dueDate?: string;
        }> = [];
        if (tender.cash > 0) breakdown.push({ method: "naqd", amount: tender.cash });
        if (tender.nasiya > 0) {
          breakdown.push({
            method: "nasiya",
            amount: tender.nasiya,
            ...(tender.nasiyaDueDate ? { dueDate: tender.nasiyaDueDate } : {}),
          });
        }

        const result = await createOrder({
          items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          clientName: customer?.name ?? "Mijoz",
          clientPhone: customer?.phone ?? "",
          targetUserUid: customer?.uid,
          totalPriceHint: subtotal,
          paymentBreakdown: breakdown,
          ticketDiscount: discount.value > 0 ? discount : undefined,
          source: "pos",
        });

        if (!result.ok) {
          if (result.status === 409 && result.stockErrors?.length) {
            const names = result.stockErrors.map((e) => e.title || e.productId).slice(0, 3).join(", ");
            toast.error(`Omborda yetarli emas: ${names}`);
          } else if (result.status === 403) {
            toast.error("Faqat admin boshqa mijoz uchun sotuv qila oladi");
          } else if (result.status === 400 && result.message?.includes("Toʻlov")) {
            toast.error("Toʻlov yigʻindisi notoʻgʻri");
          } else {
            toast.error(result.message || "Sotuv yakunlanmadi");
          }
          return;
        }

        const method: SuccessInfo["method"] =
          tender.cash > 0 && tender.nasiya > 0 ? "aralash" : tender.nasiya > 0 ? "nasiya" : "naqd";

        setSuccessInfo({
          orderId: result.orderId,
          total: subtotal,
          netTotal,
          cashGiven: tender.cash,
          change: 0, // computed in tender sheet for display only; real change tracked there
          method,
          customerName: customer?.name ?? "Mijoz",
          customerPhone: customer?.phone ?? "",
          itemCount,
        });
        setStage("success");
        setCartSheetOpen(false);
        toast.success("Sotuv muvaffaqiyatli yakunlandi");
      } catch (err) {
        console.error("POS commit error:", err);
        toast.error("Sotuvda xatolik yuz berdi");
      } finally {
        setSubmitting(false);
      }
    },
    [cart, netTotal, customer, subtotal, discount, itemCount, createOrder],
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  if (stage === "success" && successInfo) {
    return (
      <PosSuccess info={successInfo} onNew={resetTicket} onBack={() => router.push("/admin/orders")} />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col" data-no-swipe>
      {/* ── Top bar: customer chip ───────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 flex items-center gap-2">
        <button
          onClick={() => router.push("/admin")}
          className="p-2 -ml-1 hover:bg-gray-100 rounded-lg active:scale-95 transition"
          aria-label="Orqaga"
        >
          <X className="size-5 text-gray-600" />
        </button>
        <h1 className="text-base font-bold text-gray-900 hidden sm:block">Sotuv nuqtasi</h1>
        <button
          onClick={() => setCustomerSheetOpen(true)}
          className={`flex-1 ml-1 sm:ml-2 flex items-center gap-2 rounded-xl px-3 py-2 border transition ${
            customer
              ? "bg-blue-50 border-blue-200 hover:bg-blue-100"
              : "bg-gray-50 border-dashed border-gray-300 hover:bg-gray-100"
          }`}
        >
          <User className={`size-4 shrink-0 ${customer ? "text-blue-600" : "text-gray-400"}`} />
          <div className="min-w-0 text-left flex-1">
            {customer ? (
              <>
                <p className="text-sm font-semibold text-gray-900 truncate">{customer.name}</p>
                <p className="text-[11px] text-gray-500 truncate">{customer.phone || "telefon yoʻq"}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Mijozni tanlash</p>
            )}
          </div>
          {customer && customerBalance > 0 && (
            <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 shrink-0">
              Qarz: {formatNumber(customerBalance)}
            </span>
          )}
          {customer && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setCustomer(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setCustomer(null);
                }
              }}
              className="p-1 hover:bg-blue-200 rounded shrink-0 cursor-pointer"
              aria-label="Mijozni olib tashlash"
            >
              <X className="size-3.5 text-blue-700" />
            </span>
          )}
        </button>
      </div>

      {/* ── Search bar ─────────────────────────────────────── */}
      <div className="sticky top-[57px] z-20 bg-gray-50 px-3 sm:px-4 py-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Mahsulot qidirish..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            autoFocus
          />
          {productSearch && (
            <button
              onClick={() => setProductSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-lg"
              aria-label="Qidiruvni tozalash"
            >
              <X className="size-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* ── Frequents row ──────────────────────────────────── */}
      {(customerFrequents.length > 0 || frequents.length > 0) && !debouncedSearch && (
        <div className="px-3 sm:px-4 py-3 bg-white border-b border-gray-100 overflow-x-auto -mb-px">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
            {customer ? "Tez-tez buyuradi" : "Eng koʻp sotiluvchi"}
          </p>
          <div className="flex gap-2 min-w-max">
            {(customer ? customerFrequents : frequents).map(({ product }) => {
              const inCart = cart.some((l) => l.product.id === product.id);
              return (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                  className={`shrink-0 w-32 rounded-xl border p-2 text-left active:scale-[0.98] transition ${
                    inCart
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="relative w-full aspect-square rounded-lg bg-gray-100 overflow-hidden mb-1.5">
                    {product.productImageUrl?.[0]?.url ? (
                      <Image
                        src={product.productImageUrl[0].url}
                        alt={product.title}
                        fill
                        className="object-cover"
                        sizes="128px"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center">
                        <Package className="size-6 text-gray-300" />
                      </div>
                    )}
                    {inCart && (
                      <div className="absolute top-1 right-1 size-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <Check className="size-3 text-white" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-gray-900 line-clamp-2 leading-tight">{product.title}</p>
                  <p className="text-[11px] font-bold text-gray-700 mt-0.5">{formatUZS(product.price)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Result rows ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2 pb-28">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package className="size-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Mahsulot topilmadi</p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const line = cart.find((l) => l.product.id === product.id);
            const stockNum = typeof product.stock === "number" ? product.stock : 0;
            return (
              <div
                key={product.id}
                className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-2.5 sm:p-3"
              >
                <div className="relative size-14 sm:size-16 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {product.productImageUrl?.[0]?.url ? (
                    <Image
                      src={product.productImageUrl[0].url}
                      alt={product.title}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <Package className="size-5 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{product.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm font-bold text-gray-900">{formatUZS(product.price)}</p>
                    <span
                      className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${
                        stockNum <= 0
                          ? "bg-red-50 text-red-600"
                          : stockNum < 5
                          ? "bg-amber-50 text-amber-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {stockNum > 0 ? `${stockNum} dona` : "tugagan"}
                    </span>
                  </div>
                </div>
                {line ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => incQty(product.id, -1)}
                      className="size-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center active:scale-95 transition"
                    >
                      <Minus className="size-4 text-gray-700" />
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-bold text-gray-900 tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => addProduct(product)}
                      className="size-9 rounded-lg bg-blue-500 hover:bg-blue-600 flex items-center justify-center active:scale-95 transition"
                    >
                      <Plus className="size-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addProduct(product)}
                    className="shrink-0 size-10 rounded-xl bg-blue-500 hover:bg-blue-600 flex items-center justify-center active:scale-95 transition shadow-sm shadow-blue-500/20"
                  >
                    <Plus className="size-5 text-white" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Sticky bottom bar / Charge ──────────────────────── */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 px-3 sm:px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <button
              onClick={() => setCartSheetOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 active:scale-[0.98] transition"
            >
              <ShoppingCart className="size-4 text-gray-700" />
              <span className="text-sm font-bold text-gray-900">{itemCount}</span>
              <ChevronUp className="size-4 text-gray-500" />
            </button>
            <button
              onClick={() => setStage("tender")}
              disabled={cart.length === 0}
              className="flex-1 flex items-center justify-between gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl px-4 py-3 shadow-sm shadow-emerald-500/20 active:scale-[0.99] transition"
            >
              <span className="text-sm font-bold">TOʻLOV</span>
              <span className="text-base font-extrabold tabular-nums">{formatUZS(netTotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Customer picker sheet ─────────────────────────── */}
      {customerSheetOpen && (
        <CustomerPickerSheet
          users={filteredCustomers}
          balanceByUid={balanceByUid}
          onPick={(u) => {
            setCustomer(u);
            setCustomerSheetOpen(false);
          }}
          onPickAndRepeat={(u) => {
            setCustomer(u);
            setCustomerSheetOpen(false);
            setTimeout(() => repeatLastOrderForCustomer(u.uid), 50);
          }}
          onClose={() => setCustomerSheetOpen(false)}
        />
      )}

      {/* ── Cart sheet ────────────────────────────────────── */}
      {cartSheetOpen && (
        <CartSheet
          cart={cart}
          subtotal={subtotal}
          discount={discount}
          discountAmount={discountAmount}
          netTotal={netTotal}
          onIncQty={incQty}
          onSetQty={setQty}
          onRemove={removeLine}
          onChangeDiscount={setDiscount}
          onClose={() => setCartSheetOpen(false)}
          onCharge={() => {
            setCartSheetOpen(false);
            setStage("tender");
          }}
        />
      )}

      {/* ── Tender sheet ──────────────────────────────────── */}
      {stage === "tender" && (
        <TenderSheet
          netTotal={netTotal}
          customer={customer}
          customerBalance={customerBalance}
          submitting={submitting}
          onCancel={() => setStage("shopping")}
          onCommit={(tender) => commitSale(tender)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Customer picker (bottom sheet)
// ─────────────────────────────────────────────────────────────

function CustomerPickerSheet({
  users,
  balanceByUid,
  onPick,
  onPickAndRepeat,
  onClose,
}: {
  users: UserData[];
  balanceByUid: Map<string, number>;
  onPick: (u: UserData) => void;
  onPickAndRepeat: (u: UserData) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (q.trim().length < 1) return users.slice(0, 100);
    return users.filter((u) => matchesSearch(u.name, q) || (u.phone && u.phone.includes(q)));
  }, [users, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 relative">
          <div className="sm:hidden h-1 w-10 bg-gray-300 rounded-full absolute top-2 left-1/2 -translate-x-1/2" aria-hidden />
          <h3 className="text-base font-bold text-gray-900 flex-1">Mijoz tanlash</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Yopish">
            <X className="size-5 text-gray-500" />
          </button>
        </div>
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Ism yoki telefon..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Mijoz topilmadi</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((u) => {
                const bal = balanceByUid.get(u.uid) ?? 0;
                return (
                  <div
                    key={u.uid}
                    className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-2 hover:border-blue-300"
                  >
                    <button
                      onClick={() => onPick(u)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="size-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <User className="size-5 text-blue-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                        <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
                          <Phone className="size-3 shrink-0" />
                          {u.phone || "telefon yoʻq"}
                        </p>
                      </div>
                      {bal > 0 && (
                        <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 shrink-0">
                          {formatNumber(bal)}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => onPickAndRepeat(u)}
                      title="Tanlab oxirgi buyurtmani qaytarish"
                      className="shrink-0 p-2 rounded-lg hover:bg-amber-50 text-amber-600 active:scale-95 transition"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cart sheet (expanded cart with line editing)
// ─────────────────────────────────────────────────────────────

function CartSheet({
  cart,
  subtotal,
  discount,
  discountAmount,
  netTotal,
  onIncQty,
  onSetQty,
  onRemove,
  onChangeDiscount,
  onClose,
  onCharge,
}: {
  cart: CartLine[];
  subtotal: number;
  discount: { type: "pct" | "abs"; value: number };
  discountAmount: number;
  netTotal: number;
  onIncQty: (productId: string, delta: number) => void;
  onSetQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onChangeDiscount: (d: { type: "pct" | "abs"; value: number }) => void;
  onClose: () => void;
  onCharge: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:mb-4 sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 relative">
          <div className="sm:hidden h-1 w-10 bg-gray-300 rounded-full absolute top-2 left-1/2 -translate-x-1/2" aria-hidden />
          <ShoppingCart className="size-5 text-gray-700" />
          <h3 className="text-base font-bold text-gray-900 flex-1">Savat ({cart.length})</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Yopish">
            <ChevronDown className="size-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {cart.map(({ product, quantity }) => {
            const stockNum = typeof product.stock === "number" ? product.stock : 0;
            const overstock = quantity > stockNum;
            return (
              <div key={product.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                <div className="relative size-12 rounded-lg bg-white border border-gray-100 overflow-hidden shrink-0">
                  {product.productImageUrl?.[0]?.url ? (
                    <Image
                      src={product.productImageUrl[0].url}
                      alt={product.title}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <Package className="size-4 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">{product.title}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatUZS(product.price)} × {quantity} = <span className="font-bold text-gray-900">{formatUZS(Number(product.price) * quantity)}</span>
                  </p>
                  {overstock && (
                    <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="size-3" />
                      Omborda atigi {stockNum} dona
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onIncQty(product.id, -1)}
                    className="size-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center active:scale-95"
                  >
                    <Minus className="size-3.5 text-gray-700" />
                  </button>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={quantity}
                    onChange={(e) => onSetQty(product.id, parseInt(e.target.value) || 0)}
                    className="w-12 text-center text-sm font-bold text-gray-900 tabular-nums bg-white border border-gray-200 rounded-lg py-1 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={() => onIncQty(product.id, 1)}
                    className="size-8 rounded-lg bg-blue-500 hover:bg-blue-600 flex items-center justify-center active:scale-95"
                  >
                    <Plus className="size-3.5 text-white" />
                  </button>
                  <button
                    onClick={() => onRemove(product.id)}
                    className="ml-1 size-8 rounded-lg hover:bg-red-50 flex items-center justify-center active:scale-95"
                    aria-label="Olib tashlash"
                  >
                    <Trash2 className="size-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Discount */}
        <div className="px-4 py-3 border-t border-gray-100 space-y-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Chegirma</p>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => onChangeDiscount({ type: "pct", value: discount.value })}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  discount.type === "pct" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                }`}
              >
                %
              </button>
              <button
                onClick={() => onChangeDiscount({ type: "abs", value: discount.value })}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  discount.type === "abs" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                }`}
              >
                soʻm
              </button>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={discount.type === "pct" ? 100 : subtotal}
              placeholder="0"
              value={discount.value || ""}
              onChange={(e) =>
                onChangeDiscount({ type: discount.type, value: Math.max(0, parseFloat(e.target.value) || 0) })
              }
              className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <span className="text-sm font-bold text-gray-700 tabular-nums">−{formatUZS(discountAmount)}</span>
          </div>
        </div>

        {/* Totals */}
        <div className="px-4 py-3 border-t border-gray-100 space-y-1">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Oraliq summa</span>
            <span className="tabular-nums">{formatUZS(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-amber-700">
              <span>Chegirma</span>
              <span className="tabular-nums">−{formatUZS(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-extrabold text-gray-900 pt-1">
            <span>JAMI</span>
            <span className="tabular-nums">{formatUZS(netTotal)}</span>
          </div>
        </div>

        {/* Charge button */}
        <div className="px-4 pb-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            onClick={onCharge}
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-xl"
          >
            TOʻLOV {formatUZS(netTotal)}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tender sheet (cash / nasiya / mixed)
// ─────────────────────────────────────────────────────────────

function TenderSheet({
  netTotal,
  customer,
  customerBalance,
  submitting,
  onCancel,
  onCommit,
}: {
  netTotal: number;
  customer: UserData | null;
  customerBalance: number;
  submitting: boolean;
  onCancel: () => void;
  onCommit: (tender: Tender) => void;
}) {
  const [mode, setMode] = useState<"naqd" | "nasiya" | "aralash">(customer ? "nasiya" : "naqd");
  const [cashGiven, setCashGiven] = useState<number>(netTotal); // for "naqd" mode
  const [mixCash, setMixCash] = useState<number>(0);
  const [dueDate, setDueDate] = useState<string>("");

  // Update mode default when customer presence changes
  useEffect(() => {
    if (!customer && mode === "nasiya") setMode("naqd");
  }, [customer, mode]);

  // Reset cashGiven if netTotal changes (rare during tender, but defensive)
  useEffect(() => {
    if (mode === "naqd") setCashGiven(netTotal);
    if (mode === "aralash") setMixCash(Math.max(0, Math.min(mixCash, netTotal)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netTotal, mode]);

  const change = Math.max(0, cashGiven - netTotal);
  const mixNasiya = Math.max(0, netTotal - mixCash);

  const canCommit = useMemo(() => {
    if (submitting) return false;
    if (mode === "naqd") return cashGiven >= netTotal;
    if (mode === "nasiya") return !!customer && netTotal > 0;
    if (mode === "aralash") {
      if (!customer) return false;
      if (mixCash <= 0 || mixCash >= netTotal) return false;
      return true;
    }
    return false;
  }, [mode, customer, cashGiven, netTotal, mixCash, submitting]);

  const commit = () => {
    if (!canCommit) return;
    if (mode === "naqd") {
      onCommit({ cash: netTotal, nasiya: 0 });
    } else if (mode === "nasiya") {
      onCommit({ cash: 0, nasiya: netTotal, nasiyaDueDate: dueDate || undefined });
    } else {
      onCommit({ cash: mixCash, nasiya: mixNasiya, nasiyaDueDate: dueDate || undefined });
    }
  };

  const quickAmounts = useMemo(() => {
    const round = (n: number) => Math.ceil(n / 1000) * 1000;
    const a = round(netTotal);
    const b = Math.ceil(netTotal / 5000) * 5000;
    const c = Math.ceil(netTotal / 10000) * 10000;
    const d = Math.ceil(netTotal / 50000) * 50000;
    const out = Array.from(new Set([a, b, c, d])).filter((x) => x >= netTotal).sort((x, y) => x - y).slice(0, 4);
    return out;
  }, [netTotal]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-white w-full sm:max-w-lg sm:mb-4 sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 relative">
          <div className="sm:hidden h-1 w-10 bg-gray-300 rounded-full absolute top-2 left-1/2 -translate-x-1/2" aria-hidden />
          <Receipt className="size-5 text-gray-700" />
          <h3 className="text-base font-bold text-gray-900 flex-1">Toʻlov</h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Yopish" disabled={submitting}>
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-[11px] uppercase tracking-wide font-bold text-gray-500 mb-1">Toʻlanadigan summa</p>
          <p className="text-3xl font-extrabold text-gray-900 tabular-nums">{formatUZS(netTotal)}</p>
          {customer && (
            <p className="text-xs text-gray-500 mt-1">
              {customer.name}
              {customerBalance > 0 && (
                <span className="ml-2 text-red-600 font-bold">Joriy qarz: {formatNumber(customerBalance)}</span>
              )}
            </p>
          )}
        </div>

        {/* Method tabs */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setMode("naqd")}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition ${
                mode === "naqd"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <Wallet className={`size-5 ${mode === "naqd" ? "text-emerald-600" : "text-gray-500"}`} />
              <span className={`text-xs font-bold ${mode === "naqd" ? "text-emerald-700" : "text-gray-700"}`}>
                Naqd
              </span>
            </button>
            <button
              onClick={() => customer && setMode("nasiya")}
              disabled={!customer}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition ${
                mode === "nasiya"
                  ? "border-amber-500 bg-amber-50"
                  : "border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              <Clock3 className={`size-5 ${mode === "nasiya" ? "text-amber-600" : "text-gray-500"}`} />
              <span className={`text-xs font-bold ${mode === "nasiya" ? "text-amber-700" : "text-gray-700"}`}>
                Nasiya
              </span>
            </button>
            <button
              onClick={() => customer && setMode("aralash")}
              disabled={!customer}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition ${
                mode === "aralash"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              <Layers className={`size-5 ${mode === "aralash" ? "text-blue-600" : "text-gray-500"}`} />
              <span className={`text-xs font-bold ${mode === "aralash" ? "text-blue-700" : "text-gray-700"}`}>
                Aralash
              </span>
            </button>
          </div>
          {!customer && (
            <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1">
              <AlertCircle className="size-3 shrink-0" />
              Nasiya / aralash uchun mijoz kerak
            </p>
          )}
        </div>

        {/* Inputs by mode */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {mode === "naqd" && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">
                  Naqd berildi
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={netTotal}
                  value={cashGiven || ""}
                  onChange={(e) => setCashGiven(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-lg font-bold tabular-nums outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCashGiven(amt)}
                    className="rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 py-2 text-xs font-bold text-gray-700 active:scale-95 transition tabular-nums"
                  >
                    {formatNumber(amt)}
                  </button>
                ))}
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Qaytim</span>
                <span className="text-lg font-extrabold text-emerald-700 tabular-nums">{formatUZS(change)}</span>
              </div>
            </div>
          )}

          {mode === "nasiya" && customer && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <p className="text-[11px] uppercase tracking-wide font-bold text-amber-700">
                  Mijoz qarziga qoʻshiladi
                </p>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-amber-700">Hozirgi qarz</span>
                  <span className="text-sm font-bold text-amber-900 tabular-nums">{formatUZS(customerBalance)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-amber-700">Bu sotuv</span>
                  <span className="text-sm font-bold text-amber-900 tabular-nums">+{formatUZS(netTotal)}</span>
                </div>
                <div className="border-t border-amber-200 pt-1.5 flex items-baseline justify-between">
                  <span className="text-xs font-bold text-amber-800">Yangi qarz</span>
                  <span className="text-base font-extrabold text-red-700 tabular-nums">
                    {formatUZS(customerBalance + netTotal)}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">
                  Toʻlash muddati (ixtiyoriy)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </div>
            </div>
          )}

          {mode === "aralash" && customer && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wide font-bold text-emerald-700 mb-1 block">
                  Naqd qismi
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={netTotal}
                  value={mixCash || ""}
                  onChange={(e) =>
                    setMixCash(Math.max(0, Math.min(parseFloat(e.target.value) || 0, netTotal)))
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-lg font-bold tabular-nums outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Nasiya qismi</span>
                <span className="text-lg font-extrabold text-amber-700 tabular-nums">{formatUZS(mixNasiya)}</span>
              </div>
              {mixNasiya > 0 && (
                <div>
                  <label className="text-[11px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">
                    Nasiya muddati (ixtiyoriy)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 border-t border-gray-100 flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl"
          >
            Bekor qilish
          </Button>
          <Button
            onClick={commit}
            disabled={!canCommit}
            className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-xl"
          >
            {submitting ? "Saqlanmoqda..." : `Tasdiqlash · ${formatUZS(netTotal)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Success screen
// ─────────────────────────────────────────────────────────────

function PosSuccess({
  info,
  onNew,
  onBack,
}: {
  info: SuccessInfo;
  onNew: () => void;
  onBack: () => void;
}) {
  // Build receipt text for sharing
  const receiptText = useMemo(() => {
    const lines = [
      `🛒 MegaHome — Sotuv chek`,
      ``,
      `№ ${info.orderId.slice(0, 8).toUpperCase()}`,
      `${info.customerName}${info.customerPhone ? ` · ${info.customerPhone}` : ""}`,
      `${info.itemCount} ta mahsulot`,
      ``,
      `Jami: ${formatUZS(info.netTotal)}`,
      info.method === "aralash"
        ? `Toʻlov: aralash`
        : info.method === "nasiya"
        ? `Toʻlov: nasiya`
        : `Toʻlov: naqd`,
      ``,
      `Rahmat!`,
    ];
    return lines.join("\n");
  }, [info]);

  const tgUrl = useMemo(() => {
    return `https://t.me/share/url?url=${encodeURIComponent("https://www.megahome.app")}&text=${encodeURIComponent(receiptText)}`;
  }, [receiptText]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-md w-full p-6 sm:p-8 text-center">
        <div className="size-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <Check className="size-10 text-emerald-600" strokeWidth={3} />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Sotuv yakunlandi!</h2>
        <p className="text-sm text-gray-500 mb-5">№ {info.orderId.slice(0, 8).toUpperCase()}</p>

        <div className="bg-gray-50 rounded-2xl p-4 mb-5 text-left space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Mijoz</span>
            <span className="text-sm font-semibold text-gray-900 truncate max-w-[60%]">{info.customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Mahsulotlar</span>
            <span className="text-sm font-semibold text-gray-900">{info.itemCount} ta</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Toʻlov turi</span>
            <span
              className={`text-xs font-bold uppercase rounded-md px-2 py-0.5 ${
                info.method === "naqd"
                  ? "bg-emerald-100 text-emerald-700"
                  : info.method === "nasiya"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {info.method}
            </span>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between">
            <span className="text-base font-bold text-gray-900">Jami</span>
            <span className="text-base font-extrabold text-gray-900 tabular-nums">{formatUZS(info.netTotal)}</span>
          </div>
          {info.method === "naqd" && info.cashGiven > info.netTotal && (
            <div className="flex justify-between text-emerald-700">
              <span className="text-sm font-bold">Qaytim</span>
              <span className="text-sm font-extrabold tabular-nums">{formatUZS(info.cashGiven - info.netTotal)}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <a
            href={tgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#0088cc] hover:bg-[#0077b5] text-white font-bold rounded-xl py-3 transition active:scale-[0.99]"
          >
            <Send className="size-4" />
            Telegram orqali yuborish
          </a>
          <Button onClick={onNew} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-xl">
            Yangi sotuv
          </Button>
          <Button onClick={onBack} variant="outline" className="w-full rounded-xl">
            Buyurtmalarga oʻtish
          </Button>
        </div>
      </div>
    </div>
  );
}
