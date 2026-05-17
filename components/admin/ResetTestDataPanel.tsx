"use client";
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import toast from 'react-hot-toast';
import { auth } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import useCartProductStore from '@/store/useCartStore';
import useDraftStore from '@/store/useDraftStore';
import useWishlistStore from '@/store/useWishlistStore';

/**
 * Dangerous-action panel with two reset modes.
 *
 *   SAFE RESET (default) — clears every transactional collection
 *   (orders, nasiya, kirim, ombor history, idempotency keys, telegram
 *   pending refs) and zeros products.stock. Catalog (products +
 *   categories) and user accounts are preserved.
 *
 *   FACTORY RESET — also wipes products + categories. For the case
 *   where the catalog has already been deleted some other way and the
 *   dashboard still shows ghost revenue from historical orders that
 *   reference now-missing products. Use this to truly zero the
 *   dashboard before pitching the app to a shop.
 *
 * UX guards (deliberately friction-heavy):
 *   1. Pre-reset counts shown on mount so operator sees exactly what
 *      will disappear (eliminates the "did it work?" question — counts
 *      go to 0 after a successful run).
 *   2. Each mode has its own typed-RESET confirmation input.
 *   3. Factory mode adds a second native confirm() with extra warning
 *      copy because deleting products+categories is hard to undo.
 *   4. After success: clears persisted client-side stores on THIS
 *      device, force-resets notification seenIds so the badge reads
 *      0 even though user accounts survive, and reloads.
 */

const COLLECTION_LABELS: Record<string, string> = {
  orders: 'Buyurtmalar',
  nasiya: 'Nasiya (qarzdorlik)',
  stockMovements: 'Ombor harakatlari',
  stockReceipts: 'Kirim tarixi',
  idempotencyKeys: 'Idempotency kalitlari',
  telegramPendingRefs: 'Telegram vaqtinchalik ma\'lumotlar',
  products: 'Mahsulotlar (katalog)',
  categories: 'Kategoriyalar',
  user: 'Foydalanuvchilar (akkauntlar)',
  telegramUsers: 'Telegram obunachilari',
  promoCodes: 'Promo kodlar',
};

// Which collections each mode wipes — used to drive the "X ta o'chiriladi"
// preview against the live pre-reset counts.
const SAFE_DELETED = new Set([
  'orders', 'nasiya', 'stockMovements', 'stockReceipts',
  'idempotencyKeys', 'telegramPendingRefs',
]);
const FACTORY_EXTRA_DELETED = new Set(['products', 'categories']);
const PRESERVED = new Set(['user', 'telegramUsers', 'promoCodes']);

type Mode = 'safe' | 'factory';

interface ResetResponse {
  success: boolean;
  mode?: Mode;
  cleared: Record<string, number>;
  productsZeroed: number;
  durationMs: number;
  error?: string;
}

interface CountsResponse {
  success: boolean;
  counts: Record<string, number>;
  error?: string;
}

const ResetTestDataPanel = () => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState<string | null>(null);

  const [safeConfirm, setSafeConfirm] = useState('');
  const [factoryConfirm, setFactoryConfirm] = useState('');
  const [busyMode, setBusyMode] = useState<Mode | null>(null);
  const [lastResult, setLastResult] = useState<ResetResponse | null>(null);

  const isAdmin = useAuthStore((s) => s.isAdmin());

  const loadCounts = React.useCallback(async () => {
    setCountsLoading(true);
    setCountsError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        setCountsError('Tizimga kiring.');
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/data-counts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as CountsResponse;
      if (!res.ok || !data.success) {
        setCountsError(data.error || 'Hisoblashda xato.');
        return;
      }
      setCounts(data.counts);
    } catch (err) {
      setCountsError(err instanceof Error ? err.message : 'Tarmoq xatosi.');
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadCounts();
  }, [isAdmin, loadCounts]);

  const runReset = async (mode: Mode) => {
    if (busyMode) return;
    setBusyMode(mode);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('Avval qayta tizimga kiring.');
        return;
      }
      // Force-refresh token — defensive for long admin sessions where
      // the cached token may be near expiry.
      const token = await user.getIdToken(true);
      const res = await fetch('/api/admin/reset-test-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: 'RESET', mode }),
      });
      const data = (await res.json()) as ResetResponse;
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Reset bajarilmadi.');
        setLastResult(data);
        return;
      }
      setLastResult(data);

      // Wipe persisted device caches not covered by the backend reset.
      // Auth-storage is INTENTIONALLY left alone — kicking the admin to
      // login after a reset would be confusing.
      try {
        useCartProductStore.persist?.clearStorage?.();
        useDraftStore.persist?.clearStorage?.();
        useNotificationStore.persist?.clearStorage?.();
        useWishlistStore.persist?.clearStorage?.();
      } catch (err) {
        console.warn('[reset] local store clear failed:', err);
      }

      const totalDocs = Object.values(data.cleared).reduce(
        (sum, n) => sum + Math.max(0, n),
        0,
      );
      const summary = mode === 'factory'
        ? `Factory reset: ${totalDocs} ta hujjat o'chirildi (mahsulot + kategoriyalar ham).`
        : `Tozalandi: ${totalDocs} ta hujjat, ${data.productsZeroed} ta mahsulot stoki = 0.`;
      toast.success(summary, { duration: 4500 });
      setSafeConfirm('');
      setFactoryConfirm('');

      // Hard reload so every Firestore listener re-subscribes against
      // the now-empty collections and every Zustand in-memory cache is
      // discarded — including the notification store's seenIds.
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('[reset] request failed:', err);
      toast.error(err instanceof Error ? err.message : 'Tarmoq xatosi.');
    } finally {
      setBusyMode(null);
    }
  };

  const handleSafeReset = async () => {
    if (safeConfirm !== 'RESET') return;
    const proceed = typeof window !== 'undefined'
      ? window.confirm(
        'Buyurtmalar va sotuv tarixi tozalanadi.\n\n'
        + 'Mahsulotlar va kategoriyalar saqlanadi (stok 0 ga tushiriladi).\n'
        + 'Foydalanuvchilar saqlanadi.\n\nDavom etamizmi?'
      )
      : true;
    if (!proceed) return;
    await runReset('safe');
  };

  const handleFactoryReset = async () => {
    if (factoryConfirm !== 'RESET') return;
    // Two-step confirm for the destructive option.
    const proceedOne = typeof window !== 'undefined'
      ? window.confirm(
        'FACTORY RESET\n\n'
        + 'BARCHA buyurtmalar, mahsulotlar, kategoriyalar, kirim, ombor tarixi o\'chiriladi.\n\n'
        + 'Faqat foydalanuvchi akkauntlari va admin saqlanadi.\n\n'
        + 'Bu amalni qaytarib bo\'lmaydi. Davom etamizmi?'
      )
      : true;
    if (!proceedOne) return;
    const proceedTwo = typeof window !== 'undefined'
      ? window.confirm('Aniqmisiz? Mahsulot katalogi va kategoriyalar yo\'qoladi.')
      : true;
    if (!proceedTwo) return;
    await runReset('factory');
  };

  if (!isAdmin) return null;

  const renderCount = (key: string) => {
    if (!counts) return '…';
    const v = counts[key];
    if (v < 0) return 'xato';
    return `${v} ta`;
  };

  return (
    <section className="mt-8 sm:mt-10 space-y-5">
      {/* Pre-reset state — operator sees exactly what's in the database */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">
            Bazadagi ma&apos;lumotlar
          </h2>
          <button
            type="button"
            onClick={loadCounts}
            disabled={countsLoading}
            className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40 px-2 py-1 rounded-md"
          >
            {countsLoading ? 'Yuklanmoqda…' : 'Yangilash'}
          </button>
        </div>
        {countsError ? (
          <p className="text-sm text-red-600">{countsError}</p>
        ) : (
          <ul className="text-[13px] sm:text-sm divide-y divide-gray-100">
            {Object.entries(COLLECTION_LABELS).map(([key, label]) => {
              const isPreserved = PRESERVED.has(key);
              const isFactoryOnly = FACTORY_EXTRA_DELETED.has(key);
              return (
                <li key={key} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate text-gray-700">
                    {label}
                    {isPreserved && (
                      <span className="ml-1.5 text-[10px] font-bold text-green-700 uppercase tracking-wide">saqlanadi</span>
                    )}
                    {isFactoryOnly && (
                      <span className="ml-1.5 text-[10px] font-bold text-orange-600 uppercase tracking-wide">factory only</span>
                    )}
                  </span>
                  <span className="tabular-nums font-semibold text-gray-900 shrink-0">
                    {renderCount(key)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* SAFE RESET — clears transactions, keeps catalog */}
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-3">
          <span aria-hidden className="text-2xl leading-none">⚠</span>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-amber-900">
              Buyurtmalarni tozalash
            </h2>
            <p className="text-xs sm:text-sm text-amber-900/80 mt-0.5">
              Hisobotlar, daromad, sof foyda — barchasi 0 ga tushadi.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-amber-200 p-3 sm:p-4 text-[13px] sm:text-sm space-y-2">
          <div>
            <p className="font-semibold text-gray-900 mb-1">Saqlanadi:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-0.5">
              <li>Mahsulotlar va kategoriyalar (stok 0 ga tushadi)</li>
              <li>Foydalanuvchi akkauntlari</li>
              <li>Telegram obunalari va promo kodlar</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-amber-900 mb-1">O&apos;chiriladi:</p>
            <ul className="list-disc list-inside text-amber-900/90 space-y-0.5">
              {[...SAFE_DELETED].map((k) => (
                <li key={k}>{COLLECTION_LABELS[k]} <span className="text-gray-500">({renderCount(k)})</span></li>
              ))}
            </ul>
          </div>
        </div>

        <label className="block mt-4 text-xs sm:text-sm font-medium text-gray-800">
          Tasdiqlash uchun &quot;RESET&quot; yozing:
          <input
            type="text"
            value={safeConfirm}
            onChange={(e) => setSafeConfirm(e.target.value)}
            placeholder="RESET"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-1.5 block w-full rounded-xl border-2 border-amber-200 bg-white px-4 h-12 text-base font-mono tracking-widest text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-400"
          />
        </label>

        <Button
          type="button"
          onClick={handleSafeReset}
          disabled={safeConfirm !== 'RESET' || busyMode !== null}
          className="mt-4 w-full h-12 text-sm sm:text-base font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busyMode === 'safe' ? 'Tozalanmoqda…' : 'Buyurtmalarni tozalash'}
        </Button>
      </div>

      {/* FACTORY RESET — wipes products + categories too */}
      <div className="rounded-2xl border-2 border-red-300 bg-red-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-3">
          <span aria-hidden className="text-2xl leading-none">🛑</span>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-red-900">
              To&apos;liq factory reset
            </h2>
            <p className="text-xs sm:text-sm text-red-900/80 mt-0.5">
              Mahsulot va kategoriyalar ham o&apos;chiriladi. Faqat akkauntlar saqlanadi.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-red-300 p-3 sm:p-4 text-[13px] sm:text-sm space-y-2">
          <div>
            <p className="font-semibold text-gray-900 mb-1">Saqlanadi:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-0.5">
              <li>Foydalanuvchi akkauntlari (admin va mijozlar)</li>
              <li>Telegram obunalari va promo kodlar</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-red-900 mb-1">O&apos;chiriladi (qaytib bo&apos;lmaydi):</p>
            <ul className="list-disc list-inside text-red-900/90 space-y-0.5">
              {[...SAFE_DELETED, ...FACTORY_EXTRA_DELETED].map((k) => (
                <li key={k}>{COLLECTION_LABELS[k]} <span className="text-gray-500">({renderCount(k)})</span></li>
              ))}
            </ul>
          </div>
        </div>

        <label className="block mt-4 text-xs sm:text-sm font-medium text-gray-800">
          Tasdiqlash uchun &quot;RESET&quot; yozing:
          <input
            type="text"
            value={factoryConfirm}
            onChange={(e) => setFactoryConfirm(e.target.value)}
            placeholder="RESET"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-1.5 block w-full rounded-xl border-2 border-red-300 bg-white px-4 h-12 text-base font-mono tracking-widest text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-500"
          />
        </label>

        <Button
          type="button"
          onClick={handleFactoryReset}
          disabled={factoryConfirm !== 'RESET' || busyMode !== null}
          className="mt-4 w-full h-12 text-sm sm:text-base font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busyMode === 'factory' ? 'Factory reset bajarilmoqda…' : 'To\'liq factory reset'}
        </Button>
      </div>

      {/* Result panel — surfaces what actually happened so the operator
          can verify (and copy counts for a bug report if something looks
          wrong). */}
      {lastResult && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4 sm:p-5">
          <p className="text-sm font-semibold text-gray-900 mb-2">
            Oxirgi tozalash natijasi
            {lastResult.mode ? ` (${lastResult.mode === 'factory' ? 'factory' : 'safe'})` : ''}
            {typeof lastResult.durationMs === 'number'
              ? ` · ${(lastResult.durationMs / 1000).toFixed(1)}s`
              : ''}
          </p>
          <ul className="text-[13px] text-gray-700 space-y-1">
            {Object.entries(lastResult.cleared || {}).map(([key, count]) => (
              <li key={key} className="flex justify-between gap-2">
                <span className="truncate">{COLLECTION_LABELS[key] || key}</span>
                <span className={`tabular-nums font-semibold ${count < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {count < 0 ? 'xato' : `${count} ta`}
                </span>
              </li>
            ))}
            {lastResult.mode !== 'factory' && (
              <li className="flex justify-between gap-2 pt-1.5 border-t border-gray-100">
                <span>Mahsulot stoklari 0 ga tushirildi</span>
                <span className={`tabular-nums font-semibold ${lastResult.productsZeroed < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {lastResult.productsZeroed < 0 ? 'xato' : `${lastResult.productsZeroed} ta`}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ResetTestDataPanel;
