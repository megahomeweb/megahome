"use client";
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { auth } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { Trash2, AlertTriangle } from 'lucide-react';

/**
 * "Xavfli hudud" danger zone for the Hisobotlar page.
 *
 * Wipes the SALES history (orders, nasiya, sotish/qaytarish ombor rows,
 * idempotency keys) via the Admin-SDK endpoint so every report reads
 * zero and schyot-faktura numbering restarts at № 1 — without touching
 * the catalog, stock levels, or kirim history. Mirrors the confirmation
 * contract of ResetTestDataPanel (typed phrase + native confirm), with
 * the phrase "TOZALASH" naming this narrower action.
 */

interface ClearResponse {
  success?: boolean;
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

const ClearReportsPanel = () => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ClearResponse | null>(null);

  const isAdmin = useAuthStore((s) => s.isAdmin());

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

  if (!isAdmin) return null;

  const fmtCount = (key: string) => {
    if (!counts) return '…';
    const v = counts[key];
    return typeof v === 'number' && v >= 0 ? `${v} ta` : '—';
  };

  const armed = confirmText.trim().toUpperCase() === 'TOZALASH';

  const handleClear = async () => {
    if (!armed || busy) return;
    const proceed =
      typeof window !== 'undefined'
        ? window.confirm(
            'Barcha hisobotlar tozalanadi:\n\n' +
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
        body: JSON.stringify({ confirm: 'TOZALASH' }),
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
        `Hisobotlar tozalandi: ${totalDocs} ta yozuv o‘chirildi. Faktura raqami № 1 dan boshlanadi.`,
        { duration: 4500 },
      );
      setConfirmText('');

      // Hard reload so every Firestore listener re-subscribes against the
      // now-empty collections and in-memory Zustand caches are discarded.
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
              Barcha sotuv tarixi o&#x2018;chiriladi va hisobotlar noldan boshlanadi. Bu amalni qaytarib bo&#x2018;lmaydi.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-red-200 p-3 sm:p-4 text-[13px] sm:text-sm space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <p className="font-semibold text-red-900 mb-1">O&#x2018;chiriladi:</p>
              <ul className="list-disc list-inside text-red-900/90 space-y-0.5">
                <li>Buyurtmalar va sotuvlar <span className="text-gray-500">({fmtCount('orders')})</span></li>
                <li>Nasiya yozuvlari <span className="text-gray-500">({fmtCount('nasiya')})</span></li>
                <li>Sotuvga oid ombor yozuvlari</li>
                <li>Faktura raqami — &#8470; 1 dan qayta boshlanadi</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Saqlanadi:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                <li>Mahsulotlar va kategoriyalar</li>
                <li>Ombor qoldiqlari (stok)</li>
                <li>Kirim tarixi</li>
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
                {busy ? 'Tozalanmoqda…' : 'Hisobotlarni tozalash'}
              </button>
            </div>
          </div>

          {lastResult?.success && lastResult.cleared && (
            <div className="pt-2 border-t border-gray-100 text-xs text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">Natija:</p>
              <ul className="space-y-0.5">
                {Object.entries(lastResult.cleared).map(([k, v]) => (
                  <li key={k} className="tabular-nums">
                    {k}: {v < 0 ? 'xato' : `${v} ta o‘chirildi`}
                  </li>
                ))}
                <li>Faktura raqami: {lastResult.counterReset ? '№ 1 dan boshlanadi' : 'tiklanmadi'}</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ClearReportsPanel;
