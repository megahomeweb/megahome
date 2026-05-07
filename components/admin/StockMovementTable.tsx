"use client";
import React, { useMemo, useState } from "react";
import type { StockMovement, StockMovementType } from "@/lib/types";
import { formatDateTimeShort } from "@/lib/formatDate";

const TYPE_CONFIG: Record<
  StockMovementType,
  { label: string; bg: string; text: string }
> = {
  kirim: { label: "Kirim", bg: "bg-green-100", text: "text-green-700" },
  sotish: { label: "Sotish", bg: "bg-blue-100", text: "text-blue-700" },
  tuzatish: { label: "Tuzatish", bg: "bg-amber-100", text: "text-amber-700" },
  qaytarish: {
    label: "Qaytarish",
    bg: "bg-purple-100",
    text: "text-purple-700",
  },
  zarar: { label: "Zarar", bg: "bg-red-100", text: "text-red-700" },
};

const ALL_TYPES: (StockMovementType | "all")[] = [
  "all",
  "kirim",
  "sotish",
  "tuzatish",
  "qaytarish",
  "zarar",
];

const TYPE_LABELS: Record<string, string> = {
  all: "Barchasi",
  kirim: "Kirim",
  sotish: "Sotish",
  tuzatish: "Tuzatish",
  qaytarish: "Qaytarish",
  zarar: "Zarar",
};

interface StockMovementTableProps {
  movements: StockMovement[];
}

const StockMovementTable = ({ movements }: StockMovementTableProps) => {
  const [typeFilter, setTypeFilter] = useState<StockMovementType | "all">(
    "all"
  );
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = movements;
    if (typeFilter !== "all") {
      result = result.filter((m) => m.type === typeFilter);
    }
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter((m) =>
        m.productTitle.toLowerCase().includes(q)
      );
    }
    return result;
  }, [movements, typeFilter, search]);

  return (
    <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-3 sm:space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <input
          placeholder="Mahsulot qidirish..."
          className="w-full sm:max-w-xs rounded-xl bg-[#e7edf3] px-3 sm:px-4 h-10 text-sm focus:outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div data-no-swipe className="flex gap-2 overflow-x-auto scrollbar-hide sm:flex-wrap sm:overflow-visible -mx-1 px-1">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === t
                  ? "bg-black text-white"
                  : "bg-[#e7edf3] text-gray-700 hover:bg-gray-200"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-400">
        Jami: {filtered.length} ta harakat
      </p>

      {/* Desktop table */}
      <div className="hidden custom:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full w-full">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">
                Sana
              </th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">
                Mahsulot
              </th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">
                Turi
              </th>
              <th className="px-4 py-3 text-right text-black text-sm font-medium">
                Miqdor
              </th>
              <th className="px-4 py-3 text-center text-black text-sm font-medium">
                Oldin &rarr; Keyin
              </th>
              <th className="px-4 py-3 text-left text-black text-sm font-medium">
                Sabab
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="h-20 px-4 py-2 text-center text-gray-500"
                >
                  {search.length >= 2
                    ? "Harakatlar topilmadi"
                    : "Hozircha harakat yo'q"}
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const cfg = TYPE_CONFIG[m.type];
                const isPositive = m.quantity > 0;
                return (
                  <tr
                    key={m.id}
                    className="border-t border-gray-200 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">
                      {formatDateTimeShort(m.timestamp)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-sm font-semibold text-black max-w-[200px] truncate"
                      title={m.productTitle}
                    >
                      {m.productTitle}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.text}`}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-sm font-bold text-right whitespace-nowrap ${
                        isPositive ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {m.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 text-center whitespace-nowrap">
                      {m.stockBefore} &rarr; {m.stockAfter}
                    </td>
                    <td
                      className="px-4 py-2.5 text-sm text-gray-600 max-w-[180px] truncate"
                      title={m.reason}
                    >
                      {m.reason || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="custom:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-500">
            {search.length >= 2
              ? "Harakatlar topilmadi"
              : "Hozircha harakat yo'q"}
          </div>
        ) : (
          filtered.map((m) => {
            const cfg = TYPE_CONFIG[m.type];
            const isPositive = m.quantity > 0;
            return (
              <div
                key={m.id}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-semibold text-sm text-black truncate max-w-[60%]"
                    title={m.productTitle}
                  >
                    {m.productTitle}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.text}`}
                  >
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Miqdor</span>
                  <span
                    className={`font-bold ${
                      isPositive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {m.quantity}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Oldin &rarr; Keyin</span>
                  <span className="text-gray-600">
                    {m.stockBefore} &rarr; {m.stockAfter}
                  </span>
                </div>
                {m.reason && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Sabab</span>
                    <span
                      className="text-gray-600 truncate max-w-[60%] text-right"
                      title={m.reason}
                    >
                      {m.reason}
                    </span>
                  </div>
                )}
                <div className="text-xs text-gray-400 pt-1">
                  {formatDateTimeShort(m.timestamp)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default StockMovementTable;
