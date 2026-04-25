"use client";

/**
 * Sotuv nuqtasi — POS reworked to match bito.online UX.
 *
 * Layout: two-pane on desktop (lg+), single-pane stack on mobile with the
 * customer/payment panel collapsed into a bottom drawer.
 *
 * Quantity model (intentionally bito-faithful):
 *   - Adding a product → row created with `qty = null` (empty input).
 *   - Empty/0 quantity → red error "0 dan katta qiymat kiriting", `Jami narxi`
 *     shows 0, and the row does NOT add to JAMI total.
 *   - Valid integer ≥ 1 → live calc Jami narxi = qty × narx, summed into JAMI.
 *
 * Atomic commit: same `/api/orders/create` extended for `paymentBreakdown`
 * + `nasiya` ledger. UI here is a pure restyling on top of that contract.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuthStore, type UserData } from "@/store/authStore";
import useProductStore from "@/store/useProductStore";
import { useOrderStore } from "@/store/useOrderStore";
import { formatUZS, formatNumber } from "@/lib/formatPrice";
import { matchesSearch } from "@/lib/searchMatch";
import { auth } from "@/firebase/config";
import type { ProductT, Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Search,
  X,
  Plus,
  Minus,
  Package,
  Check,
  User,
  Filter,
  ScanLine,
  Printer,
  ReceiptText,
  Undo2,
  MoreHorizontal,
  Copy,
  Info,
  ArrowLeftRight,
  HandCoins,
  PercentCircle,
  UserPlus,
  PanelRightOpen,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CartLine {
  product: ProductT;
  /** null = empty input (no qty entered yet); 0 = explicit invalid; ≥1 = valid */
  qty: number | null;
}

type PaymentMode = "naqd" | "pul_otkazish" | "muddatli" | "qarz" | null;

type Stage = "shopping" | "tender" | "success";

interface SuccessInfo {
  orderId: string;
  total: number;
  netTotal: number;
  cashGiven: number;
  method: PaymentMode;
  customerName: string;
  customerPhone: string;
  itemCount: number;
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────

export default function PosScreen() {
  const router = useRouter();
  const { users, userData, fetchAllUsers } = useAuthStore();
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
  const [responsible, setResponsible] = useState<UserData | null>(null);
  const [responsibleNote, setResponsibleNote] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState<{ type: "pct" | "abs"; value: number }>({ type: "pct", value: 0 });

  // Default responsible to the logged-in admin once user data lands
  useEffect(() => {
    if (!responsible && userData) {
      setResponsible(userData as UserData);
    }
  }, [userData, responsible]);

  // ── Search ───────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(productSearch.trim()), 200);
    return () => clearTimeout(t);
  }, [productSearch]);

  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // ── Modal / sheet visibility ────────────────────────────
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showResponsibleModal, setShowResponsibleModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false); // mobile drawer
  const [stage, setStage] = useState<Stage>("shopping");

  // ── Inline customer search (right panel) ────────────────
  const [customerQuery, setCustomerQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // ── Submit state ─────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  // Close more-menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const onClick = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as Node)) setShowMoreMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showMoreMenu]);

  // Keyboard shortcuts (bito parity)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when an input/textarea has focus, except for our specific shortcuts
      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.getAttribute("contenteditable") === "true";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        productSearchRef.current?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !inField) {
        e.preventDefault();
        customerSearchRef.current?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (canFinalize()) setStage("tender");
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, discount]);

  // ─────────────────────────────────────────────────────────
  // Derived data
  // ─────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(
    () => users.filter((u) => u.role !== "admin"),
    [users],
  );

  // Inline search-as-you-type results for the right-panel customer field
  const customerSearchResults = useMemo(() => {
    if (customerQuery.trim().length < 1) return [];
    return filteredCustomers
      .filter(
        (u) =>
          matchesSearch(u.name, customerQuery) ||
          (u.phone && u.phone.includes(customerQuery)),
      )
      .slice(0, 10);
  }, [filteredCustomers, customerQuery]);

  // Outstanding nasiya balance per customer — derived from orders with paymentBreakdown.
  const balanceByUid = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      if (o.status === "bekor_qilindi") continue;
      const breakdown = (o as Order & { paymentBreakdown?: Array<{ method: string; amount: number }> }).paymentBreakdown;
      if (!breakdown) continue;
      for (const e of breakdown) {
        if (e.method === "nasiya") m.set(o.userUid, (m.get(o.userUid) ?? 0) + e.amount);
      }
    }
    return m;
  }, [orders]);

  // Optional category filter — toggled by the filter icon in the toolbar
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  // Show only in-stock products toggle
  const [inStockOnly, setInStockOnly] = useState(false);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (categoryFilter !== "all") {
      list = list.filter((p) => p.category === categoryFilter);
    }
    if (inStockOnly) {
      list = list.filter((p) => (typeof p.stock === "number" ? p.stock : 0) > 0);
    }
    if (debouncedSearch.length >= 1) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          matchesSearch(p.title, debouncedSearch) ||
          matchesSearch(p.category ?? "", debouncedSearch) ||
          matchesSearch(p.subcategory ?? "", debouncedSearch) ||
          // SKU / barcode (id) — case-insensitive substring match
          (p.id ?? "").toLowerCase().includes(q),
      );
    } else {
      list = list.slice(0, 80);
    }
    return list;
  }, [products, debouncedSearch, categoryFilter, inStockOnly]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [products]);

  // ── Cart math (bito-faithful: rows with null/0 qty contribute 0) ──
  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + (l.qty && l.qty > 0 ? Number(l.product.price) * l.qty : 0), 0),
    [cart],
  );
  const totalQty = useMemo(
    () => cart.reduce((s, l) => s + (l.qty && l.qty > 0 ? l.qty : 0), 0),
    [cart],
  );
  const validRowsCount = useMemo(
    () => cart.filter((l) => l.qty && l.qty > 0).length,
    [cart],
  );
  const discountAmount = useMemo(() => {
    if (!discount.value) return 0;
    if (discount.type === "pct") return Math.round(subtotal * (discount.value / 100));
    return Math.min(Math.round(discount.value), subtotal);
  }, [discount, subtotal]);
  const netTotal = subtotal - discountAmount;
  const customerBalance = customer ? balanceByUid.get(customer.uid) ?? 0 : 0;

  function canFinalize() {
    return cart.length > 0 && validRowsCount > 0 && !submitting;
  }

  // ─────────────────────────────────────────────────────────
  // Cart actions
  // ─────────────────────────────────────────────────────────
  const addProduct = useCallback((product: ProductT) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        // If already in cart, increment by 1 (treats as next unit)
        return prev.map((l) =>
          l.product.id === product.id
            ? { ...l, qty: (l.qty ?? 0) + 1 }
            : l,
        );
      }
      // First add: empty quantity (matches bito's behaviour exactly)
      return [...prev, { product, qty: null }];
    });
  }, []);

  const setQty = useCallback((productId: string, raw: string) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.product.id !== productId) return l;
        if (raw === "") return { ...l, qty: null };
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return { ...l, qty: null };
        return { ...l, qty: Math.max(0, n) };
      }),
    );
  }, []);

  const cloneLine = useCallback((productId: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === productId);
      if (idx < 0) return prev;
      // Insert a duplicate row right after — same product, qty null again
      const next = [...prev];
      next.splice(idx + 1, 0, { product: prev[idx].product, qty: null });
      return next;
    });
  }, []);

  const removeLine = useCallback((productId: string) => {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    if (cart.length === 0) return;
    if (!window.confirm("Savatdagi barcha mahsulotlarni o'chirishni istaysizmi?")) return;
    setCart([]);
    setDiscount({ type: "pct", value: 0 });
  }, [cart.length]);

  const resetTicket = useCallback(() => {
    setCart([]);
    setCustomer(null);
    setDiscount({ type: "pct", value: 0 });
    setProductSearch("");
    setStage("shopping");
    setCustomerSheetOpen(false);
    setSuccessInfo(null);
    setRightPanelOpen(false);
  }, []);

  // ─────────────────────────────────────────────────────────
  // Submit (commit sale)
  // ─────────────────────────────────────────────────────────
  const commitSale = useCallback(
    async (mode: PaymentMode, opts?: { cashGiven?: number; nasiyaDueDate?: string; mixCash?: number }) => {
      const validLines = cart.filter((l) => l.qty && l.qty > 0);
      if (validLines.length === 0) {
        toast.error("Hech qanday mahsulot tanlanmagan yoki miqdor noto'g'ri");
        return;
      }
      if ((mode === "qarz" || mode === "muddatli") && !customer) {
        toast.error("Qarz uchun mijoz tanlanishi shart");
        return;
      }

      setSubmitting(true);
      try {
        const breakdown: Array<{
          method: "naqd" | "nasiya" | "karta";
          amount: number;
          dueDate?: string;
        }> = [];

        if (mode === "naqd") {
          breakdown.push({ method: "naqd", amount: netTotal });
        } else if (mode === "pul_otkazish") {
          breakdown.push({ method: "karta", amount: netTotal });
        } else if (mode === "qarz") {
          breakdown.push({ method: "nasiya", amount: netTotal });
        } else if (mode === "muddatli") {
          breakdown.push({
            method: "nasiya",
            amount: netTotal,
            ...(opts?.nasiyaDueDate ? { dueDate: opts.nasiyaDueDate } : {}),
          });
        }

        const result = await createOrder({
          items: validLines.map(({ product, qty }) => ({ productId: product.id, quantity: qty as number })),
          clientName: customer?.name ?? "Mijoz",
          clientPhone: customer?.phone ?? "",
          targetUserUid: customer?.uid,
          totalPriceHint: subtotal,
          paymentBreakdown: breakdown,
          ticketDiscount: discount.value > 0 ? discount : undefined,
          source: "pos",
          orderNote: responsibleNote || undefined,
        });

        if (!result.ok) {
          if (result.status === 409 && result.stockErrors?.length) {
            const names = result.stockErrors.map((e) => e.title || e.productId).slice(0, 3).join(", ");
            toast.error(`Omborda yetarli emas: ${names}`);
          } else if (result.status === 403) {
            toast.error("Faqat admin boshqa mijoz uchun sotuv qila oladi");
          } else {
            toast.error(result.message || "Sotuv yakunlanmadi");
          }
          return;
        }

        setSuccessInfo({
          orderId: result.orderId,
          total: subtotal,
          netTotal,
          cashGiven: opts?.cashGiven ?? 0,
          method: mode,
          customerName: customer?.name ?? "Mijoz",
          customerPhone: customer?.phone ?? "",
          itemCount: validLines.reduce((s, l) => s + (l.qty as number), 0),
        });
        setStage("success");
        toast.success("Sotuv muvaffaqiyatli yakunlandi");
      } catch (err) {
        console.error("POS commit error:", err);
        toast.error("Sotuvda xatolik yuz berdi");
      } finally {
        setSubmitting(false);
      }
    },
    [cart, netTotal, customer, subtotal, discount, createOrder, responsibleNote],
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  if (stage === "success" && successInfo) {
    return <PosSuccess info={successInfo} onNew={resetTicket} onBack={() => router.push("/admin/orders")} />;
  }

  const sellerName = responsible?.name ?? userData?.name ?? "—";

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50" data-no-swipe>
      {/* ╔═══ TOP HEADER (title + action toolbar) ═══════════════════════ */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-5 py-2.5 flex items-center gap-3 shrink-0">
        <button
          onClick={() => {
            if (cart.length > 0) {
              if (!window.confirm("Savatda mahsulotlar bor. Chiqib ketishni istaysizmi?")) return;
            }
            router.push("/admin");
          }}
          className="p-1.5 -ml-1 hover:bg-gray-100 rounded-lg active:scale-95 transition lg:hidden"
          aria-label="Orqaga"
        >
          <X className="size-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Sotuv</h1>
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-1.5">
          <ToolbarIcon
            Icon={Filter}
            title={showFilter ? "Filtrni yopish" : "Kategoriya filtri"}
            active={showFilter || categoryFilter !== "all" || inStockOnly}
            onClick={() => setShowFilter((v) => !v)}
          />
          <ToolbarIcon
            Icon={ScanLine}
            title="Mahsulot kodi yoki SKU bo'yicha qidirish"
            onClick={() => productSearchRef.current?.focus()}
          />
          <ToolbarIcon
            Icon={ScanLine}
            title="QR kod skanerlash"
            rotated
            onClick={() => {
              productSearchRef.current?.focus();
              toast("QR skaneri keyingi versiyada qoʻshiladi", { icon: "📷" });
            }}
          />
          <ToolbarIcon
            Icon={ScanLine}
            title="Barkod (matn bo'yicha qidirish)"
            active
            onClick={() => productSearchRef.current?.focus()}
          />
          <ToolbarIcon
            Icon={Printer}
            title="Joriy chekni chop etish"
            onClick={() => {
              if (cart.length === 0) return toast.error("Savat boʻsh");
              const valid = cart.filter((l) => l.qty && l.qty > 0);
              if (valid.length === 0) return toast.error("Hech qanday tasdiqlangan miqdor yoʻq");
              printCartPreview({
                customerName: customer?.name ?? "Mijoz",
                customerPhone: customer?.phone ?? "",
                sellerName,
                items: valid.map((l) => ({
                  title: l.product.title,
                  qty: l.qty as number,
                  price: Number(l.product.price),
                })),
                subtotal,
                discountAmount,
                total: netTotal,
              });
            }}
          />
          <ToolbarIcon
            Icon={ReceiptText}
            title="Cheklar / Buyurtmalar ro'yxati"
            onClick={() => {
              if (cart.length > 0) {
                if (!window.confirm("Savatdagi mahsulotlar yoʻqoladi. Davom etamizmi?")) return;
              }
              router.push("/admin/orders");
            }}
          />
          <ToolbarIcon
            Icon={Undo2}
            title="Qaytarish (refund) — buyurtmalar sahifasida"
            onClick={() => router.push("/admin/orders")}
          />
          <div ref={moreMenuRef} className="relative">
            <ToolbarIcon Icon={MoreHorizontal} title="Qo'shimcha" onClick={() => setShowMoreMenu((v) => !v)} />
            {showMoreMenu && (
              <MoreMenu
                onNavigate={(href) => {
                  setShowMoreMenu(false);
                  router.push(href);
                }}
                onComing={(label) => {
                  setShowMoreMenu(false);
                  toast(`"${label}" — keyingi versiyada qoʻshiladi`, { icon: "🚧" });
                }}
              />
            )}
          </div>
        </div>
        {/* Mobile: button to open right panel */}
        <button
          onClick={() => setRightPanelOpen(true)}
          className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 active:scale-95 transition"
          aria-label="To'lov paneli"
        >
          <PanelRightOpen className="size-4" />
          <span className="text-xs font-bold tabular-nums">{formatNumber(netTotal)}</span>
        </button>
      </header>

      {/* ╔═══ MAIN CONTENT (two-pane on desktop) ════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT PANE: search + cart ──────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden lg:border-r lg:border-gray-200">
          {/* Product search (Ctrl+F) */}
          <div className="px-3 sm:px-5 pt-3 pb-2 bg-white border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
              <input
                ref={productSearchRef}
                type="text"
                placeholder="Mahsulot nomi, barkod yoki SKU"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowProductPicker(true);
                }}
                onFocus={() => setShowProductPicker(true)}
                className="w-full pl-10 pr-20 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-1.5 py-0.5">
                Ctrl+F
              </span>
            </div>
          </div>

          {/* Mas'ul shaxs pill row */}
          <div className="px-3 sm:px-5 py-3 bg-white flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowResponsibleModal(true)}
              className="px-4 py-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition shadow-sm shadow-blue-500/30"
            >
              {sellerName}
            </button>
            <button
              onClick={() => setShowResponsibleModal(true)}
              className="size-8 rounded-full border-2 border-blue-500 hover:bg-blue-50 flex items-center justify-center text-blue-600 active:scale-95 transition"
              aria-label="Qo'shimcha mas'ul shaxs"
            >
              <Plus className="size-4" />
            </button>
          </div>

          {/* Filter chip row (toggleable) */}
          {showFilter && (
            <div className="px-3 sm:px-5 pb-3 bg-white border-b border-gray-100 shrink-0 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <Filter className="size-3.5" />
                <span>Filtrlar</span>
                {(categoryFilter !== "all" || inStockOnly) && (
                  <button
                    onClick={() => { setCategoryFilter("all"); setInStockOnly(false); }}
                    className="ml-auto text-[11px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded"
                  >
                    Tozalash
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    categoryFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Barchasi
                </button>
                {allCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      categoryFilter === c ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="size-3.5 accent-blue-500 cursor-pointer"
                />
                <span className="text-gray-700">Faqat omborda bor mahsulotlar</span>
              </label>
            </div>
          )}

          {/* Cart table */}
          <div className="flex-1 overflow-auto px-3 sm:px-5 pb-4">
            {/* Header row */}
            <div className="grid grid-cols-[24px_minmax(0,1.5fr)_60px_minmax(120px,1fr)_70px_90px_90px_64px] gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
              <span>#</span>
              <span>Nomi</span>
              <span className="hidden md:inline">SKU</span>
              <span>Miqdor</span>
              <span className="hidden md:inline">Jami miqdor</span>
              <span className="text-right">Narx</span>
              <span className="text-right">Jami narxi</span>
              <span className="text-right pr-2">
                <button
                  onClick={clearCart}
                  className="inline-flex items-center justify-center size-6 hover:bg-red-50 rounded-md active:scale-95 transition text-red-500"
                  title="Savatni tozalash"
                  aria-label="Savatni tozalash"
                >
                  <BroomIcon className="size-4" />
                </button>
              </span>
            </div>

            {cart.length === 0 ? (
              <EmptyCart />
            ) : (
              <div className="space-y-0.5 mt-1">
                {cart.map((line, idx) => (
                  <CartRow
                    key={line.product.id + idx}
                    index={idx + 1}
                    line={line}
                    onSetQty={(raw) => setQty(line.product.id, raw)}
                    onClone={() => cloneLine(line.product.id)}
                    onRemove={() => removeLine(line.product.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer info bar (desktop) */}
          <FooterBar sellerName={sellerName} />
        </main>

        {/* ── RIGHT PANE: customer + payment ───────────────────────── */}
        <aside
          className={`fixed lg:static top-0 right-0 h-[100dvh] w-full sm:w-96 lg:w-[380px] xl:w-[420px] bg-white shrink-0 z-40 flex flex-col transition-transform duration-300 ease-out ${
            rightPanelOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          }`}
        >
          <RightPanel
            customer={customer}
            customerBalance={customerBalance}
            onClearCustomer={() => setCustomer(null)}
            onOpenCustomerSheet={() => setCustomerSheetOpen(true)}
            onOpenNewCustomer={() => setShowNewCustomerModal(true)}
            customerSearchRef={customerSearchRef}
            customerQuery={customerQuery}
            onCustomerQueryChange={setCustomerQuery}
            customerSearchResults={customerSearchResults}
            balanceByUid={balanceByUid}
            showCustomerDropdown={showCustomerDropdown}
            setShowCustomerDropdown={setShowCustomerDropdown}
            onPickInline={(u) => {
              setCustomer(u);
              setCustomerQuery("");
              setShowCustomerDropdown(false);
            }}
            netTotal={netTotal}
            subtotal={subtotal}
            discountAmount={discountAmount}
            discount={discount}
            onChangeDiscount={setDiscount}
            canFinalize={canFinalize()}
            submitting={submitting}
            cartLen={cart.length}
            validRows={validRowsCount}
            totalQty={totalQty}
            onPay={(mode, opts) => commitSale(mode, opts)}
            onReset={resetTicket}
            onClose={() => setRightPanelOpen(false)}
          />
        </aside>

        {/* Mobile right-panel backdrop */}
        {rightPanelOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setRightPanelOpen(false)}
          />
        )}
      </div>

      {/* ── Customer picker sheet ─────────────────────────────────── */}
      {customerSheetOpen && (
        <CustomerPickerSheet
          users={filteredCustomers}
          balanceByUid={balanceByUid}
          onPick={(u) => {
            setCustomer(u);
            setCustomerSheetOpen(false);
          }}
          onAddNew={() => {
            setCustomerSheetOpen(false);
            setShowNewCustomerModal(true);
          }}
          onClose={() => setCustomerSheetOpen(false)}
        />
      )}

      {/* ── Yangi mijoz modal ────────────────────────────────────── */}
      {showNewCustomerModal && (
        <NewCustomerModal
          onClose={() => setShowNewCustomerModal(false)}
          onCreated={(u) => {
            setCustomer(u);
            setShowNewCustomerModal(false);
          }}
        />
      )}

      {/* ── Mas'ul shaxs modal ──────────────────────────────────── */}
      {showResponsibleModal && (
        <ResponsibleModal
          users={users}
          current={responsible}
          note={responsibleNote}
          onSave={(u, n) => {
            setResponsible(u);
            setResponsibleNote(n);
            setShowResponsibleModal(false);
          }}
          onClose={() => setShowResponsibleModal(false)}
        />
      )}

      {/* ── Product picker dropdown (results below search) ───────── */}
      {showProductPicker && (
        <ProductPickerDropdown
          results={filteredProducts}
          search={debouncedSearch}
          onPick={(p) => {
            addProduct(p);
            setProductSearch("");
            setShowProductPicker(false);
            productSearchRef.current?.focus();
          }}
          onClose={() => setShowProductPicker(false)}
          cart={cart}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toolbar Icon button
// ─────────────────────────────────────────────────────────────
function ToolbarIcon({
  Icon,
  title,
  active,
  rotated,
  onClick,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  active?: boolean;
  rotated?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`size-9 rounded-lg flex items-center justify-center active:scale-95 transition ${
        active
          ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30"
          : "bg-blue-50 text-blue-600 hover:bg-blue-100"
      }`}
    >
      <Icon className={`size-4 ${rotated ? "rotate-90" : ""}`} />
    </button>
  );
}

function BroomIcon({ className = "" }: { className?: string }) {
  // Inline SVG broom — bito uses a red broom for "clear cart"
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m13 11 9-9" />
      <path d="M14.6 12.6c.8.8.9 2 .2 2.8L9.6 21l-5.4-5.4 5.6-5.2c.8-.7 2-.6 2.8.2Z" />
      <path d="m6.8 11.2 6 6" />
      <path d="m4.2 15.6.4-1" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty cart state
// ─────────────────────────────────────────────────────────────
function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="size-24 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <ReceiptText className="size-10 text-gray-300" />
      </div>
      <p className="text-sm text-gray-400">Savat bo&apos;sh</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cart row — bito's miqdor input model
// ─────────────────────────────────────────────────────────────
function CartRow({
  index,
  line,
  onSetQty,
  onClone,
  onRemove,
}: {
  index: number;
  line: CartLine;
  onSetQty: (raw: string) => void;
  onClone: () => void;
  onRemove: () => void;
}) {
  const { product, qty } = line;
  const isInvalid = qty === null || qty === 0;
  const lineTotal = qty && qty > 0 ? Number(product.price) * qty : 0;
  const stockNum = typeof product.stock === "number" ? product.stock : 0;
  const stockOver = !!qty && qty > stockNum;

  return (
    <div className="grid grid-cols-[24px_minmax(0,1.5fr)_60px_minmax(120px,1fr)_70px_90px_90px_64px] gap-2 px-2 py-2.5 items-start border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
      {/* # */}
      <span className="text-sm text-gray-500 pt-2.5 tabular-nums">{index}</span>

      {/* Nomi */}
      <div className="min-w-0 flex items-center gap-2 pt-1.5">
        <div className="relative size-9 rounded-md bg-gray-100 overflow-hidden shrink-0">
          {product.productImageUrl?.[0]?.url ? (
            <Image src={product.productImageUrl[0].url} alt={product.title} fill className="object-cover" sizes="36px" />
          ) : (
            <div className="size-full flex items-center justify-center"><Package className="size-4 text-gray-300" /></div>
          )}
        </div>
        <p className="text-sm text-gray-900 line-clamp-2 leading-tight">{product.title}</p>
      </div>

      {/* SKU */}
      <span className="text-sm text-gray-700 pt-2.5 hidden md:block">{(product.id || "").slice(0, 8)}</span>

      {/* Miqdor — the bito-faithful input */}
      <div className="min-w-0">
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Miqdorni kiriting"
            value={qty === null ? "" : String(qty)}
            onChange={(e) => onSetQty(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => e.target.select()}
            className={`w-full h-9 px-2.5 rounded-md text-sm font-medium outline-none tabular-nums transition ${
              isInvalid
                ? "border border-red-300 bg-red-50/50 text-red-700 focus:border-red-400 focus:ring-2 focus:ring-red-100 placeholder:text-red-400"
                : "border border-gray-300 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            }`}
          />
        </div>
        {isInvalid && (
          <p className="mt-1 text-[10px] text-red-500 leading-tight">0 dan katta qiymat kiriting</p>
        )}
        {!isInvalid && stockOver && (
          <p className="mt-1 text-[10px] text-amber-600 leading-tight">Omborda atigi {stockNum} dona</p>
        )}
      </div>

      {/* Jami miqdor (bito shows "X dona") */}
      <span className="text-sm text-gray-700 pt-2.5 tabular-nums hidden md:block">
        {qty && qty > 0 ? `${qty} dona` : "0 dona"}
      </span>

      {/* Narx */}
      <span className="text-sm text-gray-900 pt-2.5 text-right tabular-nums">
        {formatNumber(Number(product.price))}
      </span>

      {/* Jami narxi — 0 if invalid, calculated otherwise */}
      <span
        className={`text-sm pt-2.5 text-right tabular-nums font-semibold ${
          isInvalid ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {isInvalid ? "0" : formatNumber(lineTotal)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 pt-1.5 justify-end">
        <button
          onClick={onClone}
          title="Nusxa"
          aria-label="Nusxa"
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 active:scale-95 transition"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          onClick={onRemove}
          title="O'chirish"
          aria-label="Qatorni o'chirish"
          className="size-8 rounded-full border-2 border-red-300 hover:bg-red-50 hover:border-red-500 flex items-center justify-center text-red-500 active:scale-95 transition"
        >
          <Minus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Right panel (customer + payment)
// ─────────────────────────────────────────────────────────────
function RightPanel({
  customer,
  customerBalance,
  onClearCustomer,
  onOpenCustomerSheet,
  onOpenNewCustomer,
  customerSearchRef,
  customerQuery,
  onCustomerQueryChange,
  customerSearchResults,
  balanceByUid,
  showCustomerDropdown,
  setShowCustomerDropdown,
  onPickInline,
  netTotal,
  subtotal,
  discountAmount,
  discount,
  onChangeDiscount,
  canFinalize,
  submitting,
  cartLen,
  validRows,
  totalQty,
  onPay,
  onReset,
  onClose,
}: {
  customer: UserData | null;
  customerBalance: number;
  onClearCustomer: () => void;
  onOpenCustomerSheet: () => void;
  onOpenNewCustomer: () => void;
  customerSearchRef: React.RefObject<HTMLInputElement | null>;
  customerQuery: string;
  onCustomerQueryChange: (q: string) => void;
  customerSearchResults: UserData[];
  balanceByUid: Map<string, number>;
  showCustomerDropdown: boolean;
  setShowCustomerDropdown: (v: boolean) => void;
  onPickInline: (u: UserData) => void;
  netTotal: number;
  subtotal: number;
  discountAmount: number;
  discount: { type: "pct" | "abs"; value: number };
  onChangeDiscount: (d: { type: "pct" | "abs"; value: number }) => void;
  canFinalize: boolean;
  submitting: boolean;
  cartLen: number;
  validRows: number;
  totalQty: number;
  onPay: (mode: PaymentMode, opts?: { cashGiven?: number; nasiyaDueDate?: string; mixCash?: number }) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [showDiscount, setShowDiscount] = useState(discount.value > 0);
  const [showDueDate, setShowDueDate] = useState(false);
  const [dueDate, setDueDate] = useState("");

  return (
    <>
      {/* Mobile close button */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-base font-bold text-gray-900">Mijoz va to&apos;lov</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Yopish">
          <X className="size-5 text-gray-500" />
        </button>
      </div>

      {/* Customer search row — inline search-as-you-type with dropdown */}
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2 shrink-0 relative">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
            <input
              ref={customerSearchRef}
              type="text"
              placeholder="Mijoz ismi yoki telefon raqami"
              value={customerQuery}
              onChange={(e) => {
                onCustomerQueryChange(e.target.value);
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => {
                // Delay to allow click on dropdown items
                setTimeout(() => setShowCustomerDropdown(false), 150);
              }}
              className="w-full pl-10 pr-16 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-1.5 py-0.5">
              Ctrl+C
            </span>
          </div>
          <button
            onClick={onOpenCustomerSheet}
            title="To'liq ro'yxatdan tanlash"
            className="size-9 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center active:scale-95 transition"
            aria-label="Mijoz tanlash"
          >
            <ScanLine className="size-4" />
          </button>
          <button
            onClick={onOpenNewCustomer}
            title="Yangi mijoz qo'shish"
            className="size-9 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center active:scale-95 transition"
            aria-label="Yangi mijoz"
          >
            <UserPlus className="size-4" />
          </button>
        </div>

        {/* Inline dropdown of matching customers */}
        {showCustomerDropdown && customerQuery.trim().length >= 1 && (
          <div className="absolute left-3 right-3 sm:left-4 sm:right-4 top-[calc(100%+4px)] bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-80 overflow-y-auto">
            {customerSearchResults.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-400 mb-2">Mijoz topilmadi</p>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onOpenNewCustomer}
                  className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-bold"
                >
                  + &quot;{customerQuery}&quot; ni yangi mijoz sifatida qoʻshish
                </button>
              </div>
            ) : (
              customerSearchResults.map((u) => {
                const bal = balanceByUid.get(u.uid) ?? 0;
                return (
                  <button
                    key={u.uid}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPickInline(u)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 active:bg-gray-100 transition text-left border-b border-gray-100 last:border-b-0"
                  >
                    <div className="size-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <User className="size-4 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{u.phone || "telefon yoʻq"}</p>
                    </div>
                    {bal > 0 && (
                      <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 shrink-0">
                        {formatNumber(bal)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Customer card — when picked */}
      {customer && (
        <div className="px-3 sm:px-4 pb-2 shrink-0">
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <User className="size-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{customer.name}</p>
                <p className="text-[11px] text-gray-500 truncate">{customer.phone || "Telefon yo'q"}</p>
              </div>
            </div>
            <button
              onClick={onClearCustomer}
              className="p-1 hover:bg-blue-200 rounded-lg active:scale-95"
              aria-label="Mijozni olib tashlash"
            >
              <X className="size-4 text-blue-700" />
            </button>
          </div>
        </div>
      )}

      {/* Balance */}
      <div className="px-3 sm:px-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-gray-700">Balans:</span>
          <div className="flex-1" />
          <span className={`text-sm font-bold tabular-nums ${customerBalance > 0 ? "text-red-600" : "text-gray-700"}`}>
            {formatUZS(customerBalance)}
          </span>
          <Info className="size-3.5 text-gray-400" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide font-bold text-gray-500">Jami</p>
            <p className="text-base font-bold text-gray-900 tabular-nums">{formatUZS(netTotal)}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide font-bold text-gray-500">Qoldiq</p>
            <p className="text-base font-bold text-gray-900 tabular-nums">{formatUZS(netTotal)}</p>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4">
        {validRows > 0 && (
          <div className="bg-gray-50 rounded-xl p-3 mt-1 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Mahsulotlar</span>
              <span className="font-semibold text-gray-900 tabular-nums">{validRows} ta · {totalQty} dona</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Oraliq summa</span>
              <span className="font-semibold text-gray-900 tabular-nums">{formatUZS(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-xs text-amber-700">
                <span>Chegirma</span>
                <span className="font-semibold tabular-nums">−{formatUZS(discountAmount)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment buttons */}
      <div className="px-3 sm:px-4 py-2 space-y-2 shrink-0 border-t border-gray-100">
        <div className="grid grid-cols-2 gap-2">
          <PayButton
            label="Naqd"
            shortcut="F6"
            disabled={!canFinalize}
            onClick={() => onPay("naqd")}
          />
          <PayButton
            label="Pul o'tkazish"
            shortcut="F7"
            disabled={!canFinalize}
            onClick={() => onPay("pul_otkazish")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PayButton
            label="Muddatli to'lov"
            shortcut="Ctrl+I"
            disabled={!canFinalize || !customer}
            disabledReason={!customer ? "Mijoz kerak" : undefined}
            onClick={() => setShowDueDate(true)}
            muted
          />
          <PayButton
            label="Qarz"
            shortcut="Ctrl+K"
            disabled={!canFinalize || !customer}
            disabledReason={!customer ? "Mijoz kerak" : undefined}
            onClick={() => onPay("qarz")}
            muted
          />
        </div>

        {/* Muddatli date picker */}
        {showDueDate && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <p className="text-xs font-bold text-amber-700">Muddatli to&apos;lov sanasini tanlang:</p>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDueDate(false); setDueDate(""); }}
                className="flex-1 px-3 py-2 rounded-lg border border-amber-300 text-amber-700 text-sm font-bold hover:bg-amber-100"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => { onPay("muddatli", { nasiyaDueDate: dueDate || undefined }); setShowDueDate(false); }}
                disabled={submitting}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        )}

        {/* Discount row */}
        <div className="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-700">Umumiy chegirma</span>
            <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 rounded-md px-1.5 py-0.5">Ctrl+D</span>
          </div>
          <button
            onClick={() => setShowDiscount((v) => !v)}
            className={`size-7 rounded-full border-2 flex items-center justify-center active:scale-95 transition ${
              showDiscount ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 hover:border-blue-400 text-gray-500"
            }`}
            aria-label={showDiscount ? "Yashirish" : "Ko'rsatish"}
          >
            {showDiscount ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
          </button>
        </div>
        {showDiscount && (
          <div className="flex items-center gap-2 bg-blue-50/30 border border-blue-100 rounded-xl px-3 py-2">
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => onChangeDiscount({ type: "pct", value: discount.value })}
                className={`px-2 py-1 rounded-md text-xs font-bold ${
                  discount.type === "pct" ? "bg-blue-500 text-white" : "text-gray-500 hover:bg-gray-50"
                }`}
              >%</button>
              <button
                onClick={() => onChangeDiscount({ type: "abs", value: discount.value })}
                className={`px-2 py-1 rounded-md text-xs font-bold ${
                  discount.type === "abs" ? "bg-blue-500 text-white" : "text-gray-500 hover:bg-gray-50"
                }`}
              >so&apos;m</button>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={discount.type === "pct" ? 100 : subtotal}
              placeholder="0"
              value={discount.value || ""}
              onChange={(e) => onChangeDiscount({ type: discount.type, value: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="flex-1 px-2 py-1.5 rounded-md border border-gray-200 bg-white text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <span className="text-xs font-bold text-amber-700 tabular-nums">−{formatNumber(discountAmount)}</span>
          </div>
        )}
      </div>

      {/* Bottom action bar (Yangi / Yakunlash) */}
      <div className="grid grid-cols-2 border-t border-gray-200 shrink-0 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={onReset}
          disabled={submitting || cartLen === 0}
          className="py-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-200 transition"
        >
          Yangi
        </button>
        <button
          onClick={() => onPay("naqd")}
          disabled={!canFinalize}
          className="py-3.5 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:bg-blue-300 transition"
        >
          {submitting ? "Saqlanmoqda..." : "Yakunlash"}
          <span className="text-[10px] font-bold bg-white border border-blue-200 rounded-md px-1.5 py-0.5">Ctrl+⏎</span>
        </button>
      </div>
    </>
  );
}

function PayButton({
  label,
  shortcut,
  disabled,
  onClick,
  muted,
  disabledReason,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  muted?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled && disabledReason ? disabledReason : label}
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition ${
        muted
          ? "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
          : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:border-gray-300"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-1.5 py-0.5">{shortcut}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer info bar
// ─────────────────────────────────────────────────────────────
function FooterBar({ sellerName }: { sellerName: string }) {
  return (
    <div className="hidden lg:grid grid-cols-4 bg-gray-100 border-t border-gray-200 text-[11px] text-gray-700 px-5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Filial:</span>
        <span className="font-bold text-gray-900">MegaHome</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Ombor:</span>
        <span className="font-bold text-gray-900">Asosiy</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Narx:</span>
        <span className="font-bold text-gray-900">Chakana</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Sotuvchi:</span>
        <span className="font-bold text-gray-900 truncate">{sellerName}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Three-dot more menu
// ─────────────────────────────────────────────────────────────
function MoreMenu({
  onNavigate,
  onComing,
}: {
  onNavigate: (href: string) => void;
  onComing: (label: string) => void;
}) {
  const items: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    href?: string;
    coming?: boolean;
    highlight?: boolean;
  }> = [
    { icon: Package, label: "Ombor", href: "/admin/ombor" },
    { icon: ReceiptText, label: "Onlayn to'lovlar", href: "/admin/orders" },
    { icon: PercentCircle, label: "Narx", coming: true },
    { icon: HandCoins, label: "Pul birligi", coming: true },
    { icon: ArrowLeftRight, label: "Ayirboshlash qiymatlari", coming: true },
    { icon: ReceiptText, label: "Qo'shimcha xarajatlar", highlight: true, coming: true },
  ];
  return (
    <div className="absolute right-0 top-11 w-72 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-50">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => {
            if (it.href) onNavigate(it.href);
            else if (it.coming) onComing(it.label);
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition ${
            it.highlight ? "bg-blue-50 text-blue-700" : "text-gray-700"
          }`}
        >
          <span className={`size-7 rounded-full flex items-center justify-center ${it.highlight ? "bg-blue-100" : "bg-blue-50"}`}>
            <it.icon className={`size-3.5 ${it.highlight ? "text-blue-700" : "text-blue-500"}`} />
          </span>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Print receipt (opens new tab with formatted HTML, triggers print)
// ─────────────────────────────────────────────────────────────
function printCartPreview(opts: {
  customerName: string;
  customerPhone: string;
  sellerName: string;
  items: Array<{ title: string; qty: number; price: number }>;
  subtotal: number;
  discountAmount: number;
  total: number;
}) {
  const now = new Date();
  const dateStr = now.toLocaleString("uz-UZ");
  const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(n).replace(/,/g, " ");
  const rows = opts.items
    .map(
      (i, idx) => `
        <tr>
          <td style="text-align:center">${idx + 1}</td>
          <td>${i.title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c)}</td>
          <td style="text-align:center">${i.qty}</td>
          <td style="text-align:right">${fmt(i.price)}</td>
          <td style="text-align:right;font-weight:bold">${fmt(i.qty * i.price)}</td>
        </tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Chek — MegaHome</title>
    <style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;font-size:13px;color:#1a1a1a;margin:14px;}
      h1{margin:0 0 4px;font-size:18px;}
      .meta{color:#555;font-size:11px;margin-bottom:8px;border-bottom:1px solid #ddd;padding-bottom:6px;}
      table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;}
      th{background:#f5f5f5;text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;}
      td{padding:5px 8px;border-bottom:1px solid #eee;}
      .totals{margin-top:10px;padding-top:8px;border-top:2px solid #333;}
      .totals .row{display:flex;justify-content:space-between;padding:2px 0;}
      .totals .grand{font-size:16px;font-weight:bold;margin-top:4px;}
      .footer{margin-top:14px;text-align:center;color:#888;font-size:11px;}
      @media print{body{margin:8px;}}
    </style></head><body>
    <h1>MEGAHOME ULGURJI</h1>
    <div class="meta">
      <strong>Chek (oldin ko'rish)</strong> · Sana: ${dateStr}<br>
      Mijoz: <strong>${opts.customerName}</strong>${opts.customerPhone ? ` · ${opts.customerPhone}` : ""}<br>
      Sotuvchi: ${opts.sellerName}
    </div>
    <table>
      <thead><tr><th>#</th><th>Mahsulot</th><th>Soni</th><th style="text-align:right">Narx</th><th style="text-align:right">Jami</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Oraliq summa:</span><span>${fmt(opts.subtotal)} so'm</span></div>
      ${opts.discountAmount > 0 ? `<div class="row" style="color:#c2410c"><span>Chegirma:</span><span>−${fmt(opts.discountAmount)} so'm</span></div>` : ""}
      <div class="row grand"><span>JAMI:</span><span>${fmt(opts.total)} so'm</span></div>
    </div>
    <div class="footer">Rahmat! · MegaHome Ulgurji</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
    </body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ─────────────────────────────────────────────────────────────
// Customer picker sheet
// ─────────────────────────────────────────────────────────────
function CustomerPickerSheet({
  users,
  balanceByUid,
  onPick,
  onAddNew,
  onClose,
}: {
  users: UserData[];
  balanceByUid: Map<string, number>;
  onPick: (u: UserData) => void;
  onAddNew: () => void;
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
          <button onClick={onAddNew} className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
            <UserPlus className="size-3.5" /> Yangi
          </button>
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
                  <button
                    key={u.uid}
                    onClick={() => onPick(u)}
                    className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2 hover:border-blue-300 active:scale-[0.99] transition text-left"
                  >
                    <div className="size-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <User className="size-5 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{u.phone || "telefon yo'q"}</p>
                    </div>
                    {bal > 0 && (
                      <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 shrink-0">
                        {formatNumber(bal)}
                      </span>
                    )}
                  </button>
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
// Yangi mijoz modal — bito clone
// ─────────────────────────────────────────────────────────────
function NewCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (u: UserData) => void;
}) {
  const [type, setType] = useState<"jismoniy" | "yuridik">("jismoniy");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Mijoz ismini kiriting");
      return;
    }
    setSaving(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast.error("Avtorizatsiya xatoligi");
        return;
      }
      // Server route uses Admin SDK (bypasses rules), verifies admin/manager,
      // dedupes by phone, normalizes to +998XXXXXXXXX.
      const res = await fetch("/api/customers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone || undefined,
          customerType: type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Mijoz qoʻshilmadi");
        return;
      }
      if (data.duplicate) {
        toast.success("Bu telefon raqami bo'yicha mijoz topildi va tanlandi");
      } else {
        toast.success("Mijoz qoʻshildi");
      }
      onCreated(data.user as UserData);
    } catch (err) {
      console.error(err);
      toast.error("Mijoz qoʻshilmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded-lg" aria-label="Yopish">
          <X className="size-5 text-gray-400" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-5">Yangi mijoz</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              <span className="text-red-500">*</span> Turi
            </label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={type === "jismoniy"}
                  onChange={() => setType("jismoniy")}
                  className="size-4 accent-blue-500 cursor-pointer"
                />
                <span className={`text-sm ${type === "jismoniy" ? "text-blue-600 font-bold" : "text-gray-700"}`}>Jismoniy</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={type === "yuridik"}
                  onChange={() => setType("yuridik")}
                  className="size-4 accent-blue-500 cursor-pointer"
                />
                <span className={`text-sm ${type === "yuridik" ? "text-blue-600 font-bold" : "text-gray-700"}`}>Yuridik</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">
              <span className="text-red-500">*</span> Mijoz ismi
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-blue-300 bg-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">Telefon raqami</label>
            <div className="flex">
              <div className="px-3 py-2.5 border border-gray-200 rounded-l-lg bg-gray-50 flex items-center gap-2">
                <span className="text-base">🇺🇿</span>
                <span className="text-sm font-bold text-gray-700">+998</span>
              </div>
              <input
                type="tel"
                inputMode="tel"
                placeholder="01-345-7890"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9-]/g, ""))}
                className="flex-1 px-4 py-2.5 rounded-r-lg border border-l-0 border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full mt-6 h-12 bg-blue-500 hover:bg-blue-600 text-white text-base font-bold rounded-xl disabled:opacity-50"
        >
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mas'ul shaxs modal
// ─────────────────────────────────────────────────────────────
function ResponsibleModal({
  users,
  current,
  note,
  onSave,
  onClose,
}: {
  users: UserData[];
  current: UserData | null;
  note: string;
  onSave: (u: UserData | null, note: string) => void;
  onClose: () => void;
}) {
  const staff = useMemo(() => users.filter((u) => u.role === "admin" || u.role === "manager"), [users]);
  const [selected, setSelected] = useState<UserData | null>(current);
  const [n, setN] = useState(note);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded-lg" aria-label="Yopish">
          <X className="size-5 text-gray-400" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-5">Mas&apos;ul shaxs</h2>

        <div className="space-y-3">
          <select
            value={selected?.uid ?? ""}
            onChange={(e) => setSelected(staff.find((u) => u.uid === e.target.value) ?? null)}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer"
          >
            <option value="">— Tanlanmagan —</option>
            {staff.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Izoh kiriting"
            value={n}
            onChange={(e) => setN(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <Button
          onClick={() => onSave(selected, n)}
          className="w-full mt-6 h-12 bg-blue-500 hover:bg-blue-600 text-white text-base font-bold rounded-xl"
        >
          Saqlash va yopish
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Product picker dropdown (overlays under the search bar)
// ─────────────────────────────────────────────────────────────
function ProductPickerDropdown({
  results,
  search,
  onPick,
  onClose,
  cart,
}: {
  results: ProductT[];
  search: string;
  onPick: (p: ProductT) => void;
  onClose: () => void;
  cart: CartLine[];
}) {
  // Only show when there's a search OR no results
  if (results.length === 0 && search.length === 0) return null;

  return (
    <div className="fixed inset-0 z-40 lg:absolute lg:inset-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 lg:hidden" />
      <div
        className="absolute top-[120px] left-3 right-3 lg:left-1/2 lg:-translate-x-1/2 lg:top-[124px] lg:max-w-2xl lg:w-[calc(100%-2rem)] bg-white rounded-xl shadow-2xl border border-gray-200 max-h-[70vh] overflow-y-auto z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {results.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">Mahsulot topilmadi</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {results.slice(0, 30).map((p) => {
              const inCart = cart.some((l) => l.product.id === p.id);
              const stockNum = typeof p.stock === "number" ? p.stock : 0;
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition text-left"
                >
                  <div className="relative size-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                    {p.productImageUrl?.[0]?.url ? (
                      <Image src={p.productImageUrl[0].url} alt={p.title} fill className="object-cover" sizes="48px" />
                    ) : (
                      <div className="size-full flex items-center justify-center"><Package className="size-5 text-gray-300" /></div>
                    )}
                    {inCart && (
                      <div className="absolute top-0.5 right-0.5 size-4 rounded-full bg-blue-500 flex items-center justify-center">
                        <Check className="size-2.5 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                    <p className="text-xs text-gray-500">
                      <span className="text-gray-700 font-medium">{formatUZS(p.price)}</span>
                      <span className={`ml-2 text-[11px] font-bold ${stockNum <= 0 ? "text-red-500" : stockNum < 5 ? "text-amber-600" : "text-emerald-600"}`}>
                        {stockNum > 0 ? `${stockNum} dona` : "tugagan"}
                      </span>
                    </p>
                  </div>
                  <div className="size-9 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/30">
                    <Plus className="size-4 text-white" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
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
            <span className="text-sm font-semibold text-gray-900">{info.itemCount} dona</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">To&apos;lov turi</span>
            <span className="text-xs font-bold uppercase rounded-md px-2 py-0.5 bg-blue-100 text-blue-700">
              {info.method === "naqd" ? "Naqd" : info.method === "qarz" ? "Qarz" : info.method === "muddatli" ? "Muddatli" : "Pul o'tkazish"}
            </span>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between">
            <span className="text-base font-bold text-gray-900">Jami</span>
            <span className="text-base font-extrabold text-gray-900 tabular-nums">{formatUZS(info.netTotal)}</span>
          </div>
        </div>

        <div className="space-y-2">
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

