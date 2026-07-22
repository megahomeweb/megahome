"use client";
import React, { useState, useRef, useEffect } from "react";
import { Share2, Link as LinkIcon } from "lucide-react";
import { FaTelegram, FaWhatsapp } from "react-icons/fa";
import { formatUZS } from "@/lib/formatPrice";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";

interface ShareButtonProps {
  product: { title: string; price: string; id: string };
  className?: string;
}

const ShareButton = ({ product, className = "" }: ShareButtonProps) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const productUrl = typeof window !== "undefined"
    ? `${window.location.origin}/product/${product.id}`
    : `/product/${product.id}`;

  // Price goes into the share text only when the sharer is allowed to see
  // it — otherwise a signed-out visitor (or unapproved prospect) could
  // read the wholesale price straight out of the share sheet.
  const { canSeePrices } = useAuthStore();
  const showPrice = canSeePrices();
  const productText = showPrice
    ? `${product.title} - ${formatUZS(Number(product.price))} | MegaHome Ulgurji`
    : `${product.title} | MegaHome Ulgurji`;

  const handleTelegram = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `https://t.me/share/url?url=${encodeURIComponent(productUrl)}&text=${encodeURIComponent(productText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const handleWhatsapp = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `https://wa.me/?text=${encodeURIComponent(productText + " " + productUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(productUrl);
      toast.success("Havola nusxalandi!");
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
    setOpen(false);
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={toggleDropdown}
        className="cursor-pointer p-2 rounded-full hover:bg-gray-100 transition-colors duration-200"
        aria-label="Ulashish"
        title="Ulashish"
      >
        <Share2 className="size-5 text-gray-600" />
      </button>

      {/* Dropdown */}
      <div
        className={`absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] overflow-hidden transition-all duration-200 origin-top-right ${
          open
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={handleTelegram}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 transition-colors duration-150 cursor-pointer"
        >
          <FaTelegram className="text-[#229ED9] text-lg" />
          <span>Telegram</span>
        </button>
        <button
          type="button"
          onClick={handleWhatsapp}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-green-50 transition-colors duration-150 cursor-pointer"
        >
          <FaWhatsapp className="text-[#25D366] text-lg" />
          <span>WhatsApp</span>
        </button>
        <div className="border-t border-gray-100" />
        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
        >
          <LinkIcon className="size-[18px] text-gray-500" />
          <span>Havolani nusxalash</span>
        </button>
      </div>
    </div>
  );
};

export default ShareButton;
