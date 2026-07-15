"use client";
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { auth } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useOrderStore } from '@/store/useOrderStore';
import { Trash2, AlertTriangle, CalendarRange } from 'lucide-react';

/**
 * "Xavfli hudud" danger zone for the Hisobotlar page.
 *
 * Period-scoped tozalash: the admin picks Bugun / Oxirgi 7 kun / Shu oy /
 * Sana oraligʻi (custom from→to) / Hammasi. Partial scopes delete only that
 * window's orders (cascading nasiya + sotuv ombor rows + idempotency keys
 * by orderId, server-side) and the faktura № CONTINUES — surviving orders
 * keep their numbers. Only "Hammasi" wipes everything and restarts № at 1.
 * Confirmation contract unchanged: typed "TOZALASH" + native confirm.
 */

type Scope = 'today' | 'week' | 'month' | 'range' | 'all';

interface ClearResponse {
  success?: boolean;
  mode?: 'range' | 'all';
  cleared?: Record<string, number>;
  counterReset?: boolean;
  durationMs?: number;
  error?: string;
}

interface CountsResponse {
  success?: boolean;
  counts?: Record<string, number>;
  error?: string;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'today', label: 'Bugun' },
  { value: 'week', label: 'Oxirgi 7 kun' },
  { value: 'month', label: 'Shu oy' },
  { value: 'range', label: 'Sana oraligʻi' },
  { value: 'all', label: 'Hammasi' },
];

const ClearReportsPanel = () => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [scope, setScope] = useState<Scope>('today');
  const [fromDate, setFromDate] = useState(() => toISO(new Date()));
  const [toDate, setToDate] = useState(() => toISO(new Date()));
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ClearResponse | null>(null);

  const isAdmin = useAuthStore((s) => s.isAdmin());
  const { orders, fetchAllOrders } = useOrderStore();

  useEffect(() => { fetchAllOrders(); }, [fetchAllOrders]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/data-counts', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as CountsResponse;
        if (!cancelled && res.ok && data.success && data.counts) {
          setCounts(data.counts);
        }
      } catch {
        // Counts are advisory — the endpoint recounts server-side anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // [fromMs, toMs) window for the selected scope; null = full wipe.
  // Upper bounds are EXCLUSIVE next-day midnights so "Bugun"/"to" include
  // the entire chosen day regardless of the current wall clock.
  const window_ = useMemo((): { fromMs: number; toMs: number } | null => {
    const now = new Date();
    const tomorrow0 = dayStart(now).getTime() + 86_400_000;
    switch (scope) {
      case 'today':
        return { fromMs: dayStart(now).getTime(), toMs: tomorrow0 };
      case 'week':
        return { fromMs: dayStart(now).getTime() - 6 * 86_400_000, toMs: tomorrow0 };
      case 'month':
        return { fromMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), toMs: tomorrow0 };
      case 'range': {
        const f = new Date(`${fromDate}T00:00:00`);
        const t = new Date(`${toDate}T00:00:00`);
        if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
        return { fromMs: f.getTime(), toMs: t.getTime() + 86_400_000 };
      }
      case 'all':
        return null;
    }
  }, [scope, fromDate, toDate]);

  // Advisory: how many orders fall in the chosen window (server recounts by
  // query — this just lets the admin sanity-check BEFORE pulling the trigger).
  const matchCount = useMemo(() => {
    if (!window_) return null;
    let n = 0;
    for (const o of orders) {
      const ms = o.date?.seconds ? o.date.seconds * 1000 : 0;
      if (ms >= window_.fromMs && ms < window_.toMs) n++;
    }
    return n;
  }, [orders, window_]);

  if (!isAdmin) return null;

  const fmtCount = (key: string) => {
    if (!counts) return '…';
    const v = counts[key];
    return typeof v === 'number' && v >= 0 ? `${v} ta` : '—';
  };

  const rangeInvalid = scope === 'range' && (!window_ || window_.fromMs >= window_.toMs);
  const armed = confirmText.trim().toUpperCase() === 'TOZALASH' && !rangeInvalid;
  const scopeLabel = SCOPES.find((s) => s.value === scope)?.label ?? '';
  const periodText =
    window_ != null
      ? `${new Date(window_.fromMs).toLocaleDateString('uz-UZ')} — ${new Date(window_.toMs - 1).toLocaleDateString('uz-UZ')}`
      : '';

  const handleClear = async () => {
    if (!armed || busy) return;
    const proceed =
      typeof window !== 'undefined'
        ? window.confirm(
            window_
              ? `Tanlangan davr tozalanadi: ${scopeLabel} (${periodText})\n\n` +
                  `• Shu davrdagi ${matchCount ?? '?'} ta buyurtma/sotuv o‘chiriladi\n` +
                  '• Ularga bog‘liq nasiya va ombor yozuvlari o‘chiriladi\n' +
                  '• Faktura raqami DAVOM ETADI (qolgan buyurtmalar saqlanadi)\n\n' +
                  'Mahsulotlar, ombor qoldiqlari va kirim tarixi O‘ZGARMAYDI.\n\n' +
                  'Bu amalni qaytarib bo‘lmaydi. Davom etamizmi?'
              : 'BARCHA hisobotlar tozalanadi:\n\n' +
                  '• Buyurtmalar va sotuvlar tarixi o‘chiriladi\n' +
                  '• Nasiya (qarz) yozuvlari o‘chiriladi\n' +
                  '• Schyot-faktura raqami № 1 dan qayta boshlanadi\n\n' +
                  'Mahsulotlar, kategoriyalar va ombor qoldiqlari O‘ZGARMAYDI.\n\n' +
                  'Bu amalni qaytarib bo‘lmaydi. Davom etamizmi?',
          )
        : true;
    if (!proceed) return;

    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('Avval qayta tizimga kiring.');
        return;
      }
      // Force-refresh token — defensive for long admin sessions.
      const token = await user.getIdToken(true);
      const res = await fetch('/api/admin/clear-sales-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          confirm: 'TOZALASH',
          ...(window_ ? { fromMs: window_.fromMs, toMs: window_.toMs } : {}),
        }),
      });
      const data = (await res.json()) as ClearResponse;
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Tozalash bajarilmadi.');
        setLastResult(data);
        return;
      }
      setLastResult(data);

      // Stale seen-order ids / daily-summary date guards would otherwise
      // survive in the persisted notification store and mute alerts for
      // the freshly numbered orders.
      try {
        useNotificationStore.persist?.clearStorage?.();
      } catch (err) {
        console.warn('[clear-reports] local store clear failed:', err);
      }

      const totalDocs = Object.values(data.cleared ?? {}).reduce(
        (sum, n) => sum + Math.max(0, n),
        0,
      );
      toast.success(
        window_
          ? `${scopeLabel} tozalandi: ${totalDocs} ta yozuv o‘chirildi. Faktura raqami davom etadi.`
          : `Hisobotlar tozalandi: ${totalDocs} ta yozuv o‘chirildi. Faktura raqami № 1 dan boshlanadi.`,
        { duration: 4500 },
      );
      setConfirmText('');

      // Hard reload so every Firestore listener re-subscribes against the
      // now-changed collections and in-memory Zustand caches are discarded.
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('[clear-reports] request failed:', err);
      toast.error(err instanceof Error ? err.message : 'Tarmoq xatosi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 sm:mt-8">
      <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-4 sm:p-5">
        <div className="flex items-start gap-2.5 mb-3">
          <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-red-900">Xavfli hudud — hisobotlarni tozalash</h2>
            <p className="text-xs sm:text-sm text-red-900/80 mt-0.5">
              Davrni tanlang: faqat shu davr sotuvlari o&#x2018;chiriladi. Bu amalni qaytarib bo&#x2018;lmaydi.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-red-200 p-3 sm:p-4 text-[13px] sm:text-sm space-y-2.5">
          {/* Scope selector */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <CalendarRange className="size-3.5 text-red-600" aria-hidden /> Qaysi davr tozalansin?
            </p>
            <div data-no-swipe className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    scope === s.value
                      ? s.value === 'all'
                        ? 'bg-red-600 text-white'
                        : 'bg-black text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {scope === 'range' && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 px-2.5 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-red-400"
                  aria-label="Boshlanish sanasi"
                />
                <span className="text-gray-400">—</span>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 px-2.5 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-red-400"
                  aria-label="Tugash sanasi"
                />
              </div>
            )}
            <p className="text-xs mt-2">
              {window_ ? (
                <span className={matchCount === 0 ? 'text-gray-400' : 'text-red-700 font-semibold'}>
                  {periodText}: {matchCount ?? '…'} ta buyurtma o&#x2018;chiriladi · faktura &#8470; davom etadi
                </span>
              ) : (
                <span className="text-red-700 font-semibold">
                  BARCHA {fmtCount('orders')} buyurtma o&#x2018;chiriladi · faktura &#8470; 1 dan boshlanadi
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-gray-100">
            <div>
              <p className="font-semibold text-red-900 mb-1">O&#x2018;chiriladi:</p>
              <ul className="list-disc list-inside text-red-900/90 space-y-0.5">
                <li>{window_ ? 'Tanlangan davr buyurtmalari' : <>Buyurtmalar <span className="text-gray-500">({fmtCount('orders')})</span></>}</li>
                <li>Ularga bog&#x2018;liq nasiya yozuvlari</li>
                <li>Sotuvga oid ombor yozuvlari</li>
                {!window_ && <li>Faktura raqami — &#8470; 1 dan qayta boshlanadi</li>}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Saqlanadi:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                <li>Mahsulotlar va kategoriyalar</li>
                <li>Ombor qoldiqlari (stok)</li>
                <li>Kirim tarixi</li>
                {window_ && <li>Boshqa davrlardagi buyurtmalar va &#8470; tartibi</li>}
                <li>Foydalanuvchi akkauntlari</li>
              </ul>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label htmlFor="clear-reports-confirm" className="block text-xs font-semibold text-gray-700 mb-1.5">
              Tasdiqlash uchun <span className="font-mono font-bold text-red-700">TOZALASH</span> deb yozing:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="clear-reports-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="TOZALASH"
                autoComplete="off"
                className="flex-1 h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm font-mono tracking-wide outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
              <button
                type="button"
                onClick={handleClear}
                disabled={!armed || busy}
                className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-red-700 active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="size-4" aria-hidden />
                {busy ? 'Tozalanmoqda…' : window_ ? `Tozalash: ${scopeLabel}` : 'Hammasini tozalash'}
              </button>
            </div>
          </div>

          {lastResult?.success && lastResult.cleared && (
            <div className="pt-2 border-t border-gray-100 text-xs text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">
                Natija{lastResult.mode === 'range' ? ' (tanlangan davr)' : ''}:
              </p>
              <ul className="space-y-0.5">
                {Object.entries(lastResult.cleared).map(([k, v]) => (
                  <li key={k} className="tabular-nums">
                    {k}: {v < 0 ? 'xato' : `${v} ta o‘chirildi`}
                  </li>
                ))}
                <li>
                  Faktura raqami: {lastResult.counterReset ? '№ 1 dan boshlanadi' : 'davom etadi'}
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ClearReportsPanel;
