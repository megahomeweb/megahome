"use client";
import { useMemo } from "react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Order } from "@/lib/types";
import { isCompletedSale } from "@/lib/orderMath";

interface DailyOrdersChartProps {
  orders: Order[];
  days?: number;
}

export default function DailyOrdersChart({ orders, days = 14 }: DailyOrdersChartProps) {
  const chartData = useMemo(() => {
    const now = new Date();
    const result: { date: string; buyurtmalar: number; yetkazildi: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      let total = 0;
      let delivered = 0;

      for (const o of orders) {
        const ts = o.date?.seconds ? o.date.seconds * 1000 : 0;
        if (ts >= d.getTime() && ts < nextDay.getTime()) {
          total++;
          // "yetkazildi" green bar = any completed sale (delivered web orders
          // + POS cash sales). Previously POS sales were missing from this bar.
          if (isCompletedSale(o)) delivered++;
        }
      }

      result.push({
        date: `${d.getDate()}/${d.getMonth() + 1}`,
        buyurtmalar: total,
        yetkazildi: delivered,
      });
    }
    return result;
  }, [orders, days]);

  const hasData = chartData.some((d) => d.buyurtmalar > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Hozircha ma&apos;lumotlar mavjud emas
      </div>
    );
  }

  return (
    <div className="w-full h-48 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-xl p-2.5 shadow-lg text-xs">
                  <p className="font-bold text-gray-900 mb-1">{label}</p>
                  <p className="text-blue-600">Jami: {payload[0]?.value} ta</p>
                  <p className="text-emerald-600">Yetkazildi: {payload[1]?.value} ta</p>
                </div>
              );
            }}
          />
          <Bar dataKey="buyurtmalar" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
          <Bar dataKey="yetkazildi" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
