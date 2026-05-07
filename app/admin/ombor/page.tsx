"use client";
import React, { useEffect, useMemo } from "react";
import PanelTitle from "@/components/admin/PanelTitle";
import StockMovementTable from "@/components/admin/StockMovementTable";
import useStockMovementStore from "@/store/useStockMovementStore";
import { toDate } from "@/lib/formatDate";
import { PackagePlus, PackageMinus, Settings2 } from "lucide-react";

const OmborPage = () => {
  const { movements, fetchMovements, loading } = useStockMovementStore();

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayKirim = useMemo(() => {
    return movements
      .filter((m) => {
        if (m.type !== "kirim") return false;
        const d = toDate(m.timestamp);
        return d !== null && d >= todayStart;
      })
      .reduce((sum, m) => sum + (m.quantity > 0 ? m.quantity : 0), 0);
  }, [movements, todayStart]);

  const todayChiqim = useMemo(() => {
    return movements
      .filter((m) => {
        if (m.type !== "sotish") return false;
        const d = toDate(m.timestamp);
        return d !== null && d >= todayStart;
      })
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  }, [movements, todayStart]);

  const todayTuzatish = useMemo(() => {
    return movements.filter((m) => {
      if (m.type !== "tuzatish") return false;
      const d = toDate(m.timestamp);
      return d !== null && d >= todayStart;
    }).length;
  }, [movements, todayStart]);

  if (loading) {
    return (
      <div>
        <PanelTitle title="Ombor" />
        <div className="px-4 py-3">
          <p className="text-gray-500 text-sm">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PanelTitle title="Ombor" />
      <p className="px-3 sm:px-4 -mt-1 sm:-mt-2 mb-3 sm:mb-4 text-xs sm:text-sm text-gray-500">
        Ombordagi barcha harakatlar tarixi
      </p>

      {/* Summary Cards — mobile keeps 3 cols but cards lose label noise + size text down so 360dp viewports don't clip */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4 px-3 sm:px-4 mb-4 sm:mb-6">
        {/* Today's incoming */}
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-2.5 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">
                Kirim
              </p>
              <p className="text-xl sm:text-3xl font-bold text-gray-900 mt-1 tabular-nums">
                {todayKirim}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">dona qabul</p>
            </div>
            <div className="flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl bg-green-100 shrink-0">
              <PackagePlus className="size-3.5 sm:size-5 text-green-600" />
            </div>
          </div>
        </div>

        {/* Today's outgoing */}
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-2.5 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">
                Chiqim
              </p>
              <p className="text-xl sm:text-3xl font-bold text-gray-900 mt-1 tabular-nums">
                {todayChiqim}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">dona sotildi</p>
            </div>
            <div className="flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl bg-blue-100 shrink-0">
              <PackageMinus className="size-3.5 sm:size-5 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Today's adjustments */}
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-2.5 sm:p-4 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">
                Tuzatish
              </p>
              <p className="text-xl sm:text-3xl font-bold text-gray-900 mt-1 tabular-nums">
                {todayTuzatish}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">bugun</p>
            </div>
            <div className="flex items-center justify-center size-7 sm:size-11 rounded-lg sm:rounded-xl bg-amber-100 shrink-0">
              <Settings2 className="size-3.5 sm:size-5 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Movement history table */}
      <div className="mb-4">
        <h3 className="font-bold text-base sm:text-lg px-3 sm:px-4 mb-2">Harakatlar tarixi</h3>
        <StockMovementTable movements={movements} />
      </div>
    </div>
  );
};

export default OmborPage;
