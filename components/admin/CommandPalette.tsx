"use client";

import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import useProductStore from "@/store/useProductStore";
import { useOrderStore } from "@/store/useOrderStore";
import { formatUZS } from "@/lib/formatPrice";
import {
  Package, ShoppingCart, Users, BarChart3, FileText,
  Truck, Settings, Search, Plus, MessageCircle,
} from "lucide-react";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { products } = useProductStore();
  const { orders } = useOrderStore();
  // Remember the focused element when the palette opens so we can
  // restore it on close — without this, closing the palette via ESC or
  // backdrop-click leaves focus on <body>, which is a screen-reader
  // dead zone and breaks keyboard nav for sighted users too.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Toggle on Cmd/Ctrl+K from anywhere, including inside form inputs.
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // ESC must close the palette globally even when focus has moved
      // outside the cmdk Input — cmdk's own onKeyDown only fires on its
      // internal input element. Without this handler the user can be
      // stuck inside the overlay if they tab to a Command.Item then
      // press ESC.
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  // Capture caller's focus on open; restore it on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    } else if (restoreFocusRef.current) {
      const el = restoreFocusRef.current;
      restoreFocusRef.current = null;
      // requestAnimationFrame so the DOM has unmounted the overlay
      // before we move focus, otherwise the focus jump can be lost.
      requestAnimationFrame(() => {
        try { el.focus(); } catch {}
      });
    }
  }, [open]);

  const runCommand = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Qidirish">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-[101]">
        <Command label="Qidirish">
          <Command.Input
            placeholder="Qidirish... (mahsulot, buyurtma, sahifa)"
            className="w-full px-4 py-3.5 text-sm border-b border-gray-200 outline-none placeholder:text-gray-400"
          />
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-gray-500">
              Natija topilmadi
            </Command.Empty>

            <Command.Group heading="Tezkor amallar" className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <Command.Item
                onSelect={() => runCommand(() => router.push("/admin/create-product"))}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-gray-700 hover:bg-gray-100 data-[selected=true]:bg-gray-100"
              >
                <Plus className="size-4 text-gray-400" />
                Yangi mahsulot qo&#39;shish
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/admin/create-category"))}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-gray-700 hover:bg-gray-100 data-[selected=true]:bg-gray-100"
              >
                <Plus className="size-4 text-gray-400" />
                Yangi kategoriya qo&#39;shish
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/admin/create-order"))}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-gray-700 hover:bg-gray-100 data-[selected=true]:bg-gray-100"
              >
                <ShoppingCart className="size-4 text-gray-400" />
                Yangi buyurtma yaratish
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Sahifalar" className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {[
                { name: "Dashboard", icon: BarChart3, path: "/admin" },
                { name: "Mahsulotlar", icon: Package, path: "/admin/products" },
                { name: "Buyurtmalar", icon: ShoppingCart, path: "/admin/orders" },
                { name: "Mijozlar", icon: Users, path: "/admin/customers" },
                { name: "Fakturalar", icon: FileText, path: "/admin/invoices" },
                { name: "Telegram Bot", icon: MessageCircle, path: "/admin/telegram" },
                { name: "Kirim", icon: Truck, path: "/admin/kirim" },
                { name: "Hisobotlar", icon: BarChart3, path: "/admin/reports" },
                { name: "Profil", icon: Settings, path: "/admin/profile" },
              ].map((page) => (
                <Command.Item
                  key={page.path}
                  onSelect={() => runCommand(() => router.push(page.path))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-gray-700 hover:bg-gray-100 data-[selected=true]:bg-gray-100"
                >
                  <page.icon className="size-4 text-gray-400" />
                  {page.name}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Mahsulotlar" className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {products.slice(0, 8).map((p) => (
                <Command.Item
                  key={p.id}
                  value={`product ${p.title} ${p.category}`}
                  onSelect={() => runCommand(() => router.push(`/admin/update-product/${p.id}`))}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-gray-700 hover:bg-gray-100 data-[selected=true]:bg-gray-100"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Package className="size-4 text-gray-400 shrink-0" />
                    <span className="truncate">{p.title}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{formatUZS(Number(p.price))}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Buyurtmalar" className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {orders.slice(0, 5).map((o) => (
                <Command.Item
                  key={o.id}
                  value={`order ${o.clientName} ${o.clientPhone} ${o.id}`}
                  onSelect={() => runCommand(() => router.push(`/admin/invoice/${o.id}`))}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-gray-700 hover:bg-gray-100 data-[selected=true]:bg-gray-100"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ShoppingCart className="size-4 text-gray-400 shrink-0" />
                    <span className="truncate">{o.clientName}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{formatUZS(o.totalPrice)}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-gray-400">
            <span>↑↓ tanlash &middot; Enter ochish</span>
            <span>ESC yopish</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
