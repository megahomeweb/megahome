"use client";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Order } from "@/lib/types";
import { formatUZS } from "@/lib/formatPrice";
import { isCompletedSale, orderRevenue, orderCost } from "@/lib/orderMath";

interface RevenueChartProps {
  orders: Order[];
  days?: number;
}

export default function RevenueChart({ orders, days = 14 }: RevenueChartProps) {
  const chartData = useMemo(() => {
    const now = new Date();
    const result: { date: string; daromad: number; foyda: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      let revenue = 0;
      let cost = 0;

      for (const o of orders) {
        // Match dashboard / reports: count any completed sale (delivered web
        // orders + POS sales), use netTotal not gross totalPrice so promo /
        // ticket discounts are honoured.
        if (!isCompletedSale(o)) continue;
        const ts = o.date?.seconds ? o.date.seconds * 1000 : 0;
        if (ts >= d.getTime() && ts < nextDay.getTime()) {
          revenue += orderRevenue(o);
          cost += orderCost(o);
        }
      }

      result.push({
        date: `${d.getDate()}/${d.getMonth() + 1}`,
        daromad: revenue,
        foyda: revenue - cost,
      });
    }
    return result;
  }, [orders, days]);

  const hasData = chartData.some((d) => d.daromad > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Hozircha ma&apos;lumotlar mavjud emas
      </div>
    );
  }

  return (
    <div className="w-full h-52 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorDaromad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorFoyda" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
                  <p className="font-bold text-gray-900 mb-1">{label}</p>
                  <p className="text-emerald-600">Daromad: {formatUZS(payload[0]?.value as number)}</p>
                  <p className="text-amber-600">Foyda: {formatUZS(payload[1]?.value as number)}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="daromad"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#colorDaromad)"
            dot={false}
            activeDot={{ r: 5, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="foyda"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#colorFoyda)"
            dot={false}
            activeDot={{ r: 5, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
