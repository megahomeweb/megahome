"use client";
import React, { useEffect, useMemo, useState } from 'react';
import PanelTitle from '@/components/admin/PanelTitle';
import { useExpenseStore } from '@/store/useExpenseStore';
import { formatUZS } from '@/lib/formatPrice';
import { toWholeMoney } from '@/lib/money';
import { Timestamp } from 'firebase/firestore';
import { Wallet, Plus, Trash2, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';

// Xarajatlar (rasxod) — C in the P&L chain shown on /admin/reports:
//   A savdo aylanmasi − B tan narxi − C xarajat = D sof foyda (daromad).
// Money is integer USD (whole-dollar policy) — inputs go through toWholeMoney.

const CATEGORIES = ['Ijara', 'Maosh', 'Transport', 'Kommunal', 'Reklama', 'Boshqa'] as const;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const XarajatlarPage = () => {
  const { expenses, loading, fetchExpenses, addExpense, deleteExpense } = useExpenseStore();
  const [form, setForm] = useState({ title: '', amount: '', category: 'Boshqa', note: '', date: todayISO() });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const stats = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let today = 0, month = 0, all = 0;
    for (const e of expenses) {
      const ms = e.date?.seconds ? e.date.seconds * 1000 : 0;
      const a = e.amount || 0;
      all += a;
      if (ms >= monthStart) month += a;
      if (ms >= dayStart) today += a;
    }
    return { today, month, all };
  }, [expenses]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const title = form.title.trim();
    const amount = toWholeMoney(form.amount);
    if (!title) return toast.error('Xarajat nomini kiriting');
    if (!amount || amount <= 0) return toast.error('Summani kiriting (butun $ da)');
    if (!form.date) return toast.error('Sanani tanlang');

    setSaving(true);
    try {
      // Local midday avoids the picked day drifting ±1 across timezones.
      const when = new Date(`${form.date}T12:00:00`);
      await addExpense({
        title,
        amount,
        category: form.category,
        note: form.note.trim() || undefined,
        date: Timestamp.fromDate(when),
      } as Parameters<typeof addExpense>[0]);
      toast.success(`Xarajat qoʼshildi — ${formatUZS(amount)}`);
      setForm({ title: '', amount: '', category: form.category, note: '', date: todayISO() });
    } catch (e) {
      console.error(e);
      toast.error('Saqlab boʼlmadi');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`"${title}" xarajati oʼchirilsinmi?`)) return;
    try {
      await deleteExpense(id);
      toast.success('Oʼchirildi');
    } catch {
      toast.error('Oʼchirib boʼlmadi');
    }
  };

  const fmtDate = (t?: { seconds?: number }) =>
    t?.seconds ? new Date(t.seconds * 1000).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <div>
      <PanelTitle title="Xarajatlar" />
      <div className="px-3 sm:px-4 py-2 sm:py-3">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold">Bugun</p>
            <p className="text-lg sm:text-2xl font-bold text-red-600 tabular-nums">{formatUZS(stats.today)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold">Shu oy</p>
            <p className="text-lg sm:text-2xl font-bold text-red-600 tabular-nums">{formatUZS(stats.month)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold">Jami</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-700 tabular-nums">{formatUZS(stats.all)}</p>
          </div>
        </div>

        {/* Add form */}
        <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="size-4 text-red-600" />
            <h3 className="font-bold text-sm">Yangi xarajat</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Nomi (masalan: Ijara — iyul)"
              className="col-span-2 lg:col-span-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
            <input
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d]/g, '') }))}
              inputMode="numeric"
              placeholder="Summa ($, butun)"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="border border-gray-200 rounded-xl px-2 py-2 text-sm outline-none bg-white"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white"
            />
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-1.5 bg-black text-white rounded-xl px-3 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 cursor-pointer"
            >
              <Plus className="size-4" /> {saving ? 'Saqlanmoqda…' : 'Qoʼshish'}
            </button>
          </div>
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Izoh (ixtiyoriy)"
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </form>

        {/* List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-100 flex items-center gap-2">
            <CalendarDays className="size-4 text-gray-600" />
            <h3 className="font-bold text-sm">Xarajatlar tarixi ({expenses.length})</h3>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Yuklanmoqda…</p>
          ) : expenses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">
              Hali xarajat yoʼq — birinchisini yuqoridagi forma orqali qoʼshing.
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div data-no-swipe className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Sana</th>
                      <th className="text-left px-4 py-2 font-medium">Nomi</th>
                      <th className="text-left px-4 py-2 font-medium">Kategoriya</th>
                      <th className="text-left px-4 py-2 font-medium">Izoh</th>
                      <th className="text-right px-4 py-2 font-medium">Summa</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className="border-t border-gray-50">
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-4 py-2 font-medium">{e.title}</td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{e.category}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500">{e.note || '—'}</td>
                        <td className="px-4 py-2 text-right font-bold text-red-600 tabular-nums">{formatUZS(e.amount)}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => remove(e.id, e.title)}
                            className="text-gray-300 hover:text-red-600 cursor-pointer"
                            title="Oʼchirish"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {expenses.map((e) => (
                  <div key={e.id} className="px-3 py-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {fmtDate(e.date)} · {e.category}{e.note ? ` · ${e.note}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-red-600 tabular-nums">{formatUZS(e.amount)}</span>
                      <button onClick={() => remove(e.id, e.title)} className="text-gray-300 hover:text-red-600" title="Oʼchirish">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default XarajatlarPage;
