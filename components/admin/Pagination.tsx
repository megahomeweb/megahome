"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  total: number;
  page: number;
  perPage: number;
  onPageChange: (p: number) => void;
  onPerPageChange: (n: number) => void;
  perPageOptions?: number[];
  /** Localized label for "rows per page". Default: "Qator". */
  perPageLabel?: string;
  className?: string;
}

const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50, 100];

/**
 * Build a Bitrix-style page-number row with ellipses.
 *
 * Examples (current page underlined as `[n]`):
 *   total 7  page 3 → 1 2 [3] 4 5 6 7
 *   total 30 page 1 → [1] 2 3 4 5 ... 30
 *   total 30 page 6 → 1 ... 5 [6] 7 ... 30
 *   total 30 page 30 → 1 ... 26 27 28 29 [30]
 */
function buildPageList(currentPage: number, totalPages: number): Array<number | "ellipsis-l" | "ellipsis-r"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: Array<number | "ellipsis-l" | "ellipsis-r"> = [];
  out.push(1);
  if (currentPage > 4) out.push("ellipsis-l");
  const start = Math.max(2, currentPage - 2);
  const end = Math.min(totalPages - 1, currentPage + 2);
  for (let i = start; i <= end; i++) out.push(i);
  if (currentPage < totalPages - 3) out.push("ellipsis-r");
  out.push(totalPages);
  return out;
}

export default function Pagination({
  total,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  perPageLabel = "Qator",
  className = "",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const end = Math.min(safePage * perPage, total);

  const pageList = useMemo(() => buildPageList(safePage, totalPages), [safePage, totalPages]);

  if (total === 0) return null;

  return (
    <nav
      aria-label="Sahifalar"
      data-no-swipe
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 py-2 sm:py-3 ${className}`}
    >
      {/* Range + per-page selector */}
      <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600 px-1">
        <p className="tabular-nums">
          <span className="font-bold text-gray-900">{start}</span>
          <span className="mx-1">–</span>
          <span className="font-bold text-gray-900">{end}</span>
          <span className="mx-1.5 text-gray-400">/</span>
          <span className="font-medium text-gray-700">{total}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <label htmlFor="pp" className="text-xs text-gray-500">
            {perPageLabel}:
          </label>
          <select
            id="pp"
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer hover:bg-gray-100"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Page navigator — horizontally scrollable on narrow phones if many pages */}
      <div className="flex items-center gap-1 justify-center sm:justify-end overflow-x-auto scrollbar-hide" role="group">
        <button
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className="size-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center active:scale-95 transition"
          aria-label="Oldingi sahifa"
        >
          <ChevronLeft className="size-4 text-gray-700" />
        </button>

        {pageList.map((item, i) => {
          if (item === "ellipsis-l" || item === "ellipsis-r") {
            return (
              <span
                key={`${item}-${i}`}
                className="size-9 flex items-center justify-center text-xs font-medium text-gray-400 select-none"
                aria-hidden
              >
                …
              </span>
            );
          }
          const active = item === safePage;
          return (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              aria-current={active ? "page" : undefined}
              aria-label={`${item}-sahifa`}
              className={`min-w-9 h-9 px-2 rounded-lg text-xs font-bold tabular-nums cursor-pointer flex items-center justify-center active:scale-95 transition ${
                active
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item}
            </button>
          );
        })}

        <button
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className="size-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center active:scale-95 transition"
          aria-label="Keyingi sahifa"
        >
          <ChevronRight className="size-4 text-gray-700" />
        </button>
      </div>
    </nav>
  );
}

/**
 * Hook that returns paginated data + paging state. Auto-resets page to 1
 * when the data length changes (i.e. when filters/search narrow results).
 */
import { useEffect, useState } from "react";

export function usePagination<T>(data: T[], initialPerPage = 25) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);

  // Reset to page 1 when filtered count drops below current window
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    if (page > totalPages) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, perPage]);

  const start = (page - 1) * perPage;
  const end = start + perPage;
  const pageItems = data.slice(start, end);

  return {
    page,
    perPage,
    setPage,
    setPerPage,
    pageItems,
    total: data.length,
  };
}
