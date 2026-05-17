"use client";
import React, { useState } from 'react';
import { Button } from '../ui/button';
import toast from 'react-hot-toast';
import { auth } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import useCartProductStore from '@/store/useCartStore';
import useDraftStore from '@/store/useDraftStore';
import useWishlistStore from '@/store/useWishlistStore';

/**
 * Dangerous-action panel. Posts to /api/admin/reset-test-data, which
 * clears every transactional Firestore collection (orders, nasiya, kirim,
 * ombor history, idempotency keys, telegram pending refs) and zeros the
 * stock field on every product. Catalog (products + categories) and user
 * accounts are preserved.
 *
 * UX guards (deliberately friction-heavy):
 *   1. Visible warning card explaining exactly what disappears.
 *   2. Type the word RESET into a confirmation input (case-sensitive) —
 *      enables the button only when matched. Defends against muscle-
 *      memory triple-tap on a phone.
 *   3. Native confirm() right before fire — last chance to cancel.
 *   4. Locks the button while the request is in flight; on success,
 *      also clears the persisted client-side stores on THIS device
 *      (cart / drafts / notifications / wishlist) so the demo screen
 *      matches the now-empty backend without a manual hard refresh.
 */
const COLLECTION_LABELS: Record<string, string> = {
  orders: 'Buyurtmalar',
  nasiya: 'Nasiya (qarzdorlik)',
  stockMovements: 'Ombor harakatlari',
  stockReceipts: 'Kirim tarixi',
  idempotencyKeys: 'Idempotency kalitlari',
  telegramPendingRefs: 'Telegram vaqtinchalik ma\'lumotlar',
};

interface ResetResponse {
  success: boolean;
  cleared: Record<string, number>;
  productsZeroed: number;
  durationMs: number;
  error?: string;
}

const ResetTestDataPanel = () => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ResetResponse | null>(null);
  const canFire = confirmText === 'RESET' && !loading;

  const handleReset = async () => {
    if (!canFire) return;
    // Final guard before issuing the destructive POST. Keep the message
    // explicit — operators have triggered destructive flows by tapping
    // through a generic "Are you sure?" without reading.
    const proceed = typeof window !== 'undefined'
      ? window.confirm(
        'Test ma\'lumotlarini tozalashni davom ettiramizmi?\n\n'
        + 'O\'chiriladi: buyurtmalar, nasiya, kirim, ombor tarixi.\n'
        + 'Mahsulot stoklari 0 ga tushiriladi.\n'
        + 'Mahsulotlar, kategoriyalar, foydalanuvchilar saqlanadi.'
      )
      : true;
    if (!proceed) return;

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('Avval qayta tizimga kiring.');
        setLoading(false);
        return;
      }
      // Force-refresh the token so a long-running admin session can't
      // hit a stale-token rejection on the most destructive endpoint
      // we have. Cheap insurance.
      const token = await user.getIdToken(true);
      const res = await fetch('/api/admin/reset-test-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: 'RESET' }),
      });
      const data = (await res.json()) as ResetResponse;
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Reset bajarilmadi.');
        setLastResult(data);
        return;
      }
      setLastResult(data);

      // Wipe the persisted-on-device caches that aren't covered by the
      // backend reset (they'd otherwise keep showing the previous user's
      // cart, drafts, unread notifications, wishlist). Auth-storage is
      // INTENTIONALLY left alone so the admin doesn't get kicked to login.
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
      toast.success(
        `Tozalandi: ${totalDocs} ta hujjat, ${data.productsZeroed} ta mahsulot stoki = 0.`,
        { duration: 4500 },
      );
      setConfirmText('');

      // Hard reload so every Firestore listener resubscribes against the
      // now-empty collections and every Zustand-in-memory cache is
      // discarded. Without this, the dashboard shows the operator's
      // pre-reset snapshot until they manually refresh.
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('[reset] request failed:', err);
      toast.error(err instanceof Error ? err.message : 'Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  };

  // Only render for the admin email — defense in depth, even though the
  // API endpoint independently verifies the Bearer token.
  const isAdmin = useAuthStore((s) => s.isAdmin());
  if (!isAdmin) return null;

  return (
    <section className="mt-8 sm:mt-10 rounded-2xl border-2 border-red-200 bg-red-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-2 mb-3">
        <span aria-hidden className="text-2xl leading-none">⚠</span>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-red-900">
            Test ma&apos;lumotlarini tozalash
          </h2>
          <p className="text-xs sm:text-sm text-red-800/90 mt-0.5">
            Ilovani &quot;noldan&quot; test qilish uchun. Faqat admin uchun.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-3 sm:p-4 text-[13px] sm:text-sm space-y-2">
        <div>
          <p className="font-semibold text-gray-900 mb-1">Saqlanadi:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-0.5">
            <li>Mahsulotlar va kategoriyalar (stok 0 ga tushiriladi)</li>
            <li>Foydalanuvchi akkauntlari (admin va mijozlar)</li>
            <li>Telegram obunalari va promo kodlar</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-red-900 mb-1">O&apos;chiriladi (qaytib bo&apos;lmaydi):</p>
          <ul className="list-disc list-inside text-red-800 space-y-0.5">
            <li>Buyurtmalar va savdo tarixi (hisobotlar, daromad, sof foyda — barchasi 0)</li>
            <li>Nasiya (qarzdorlik) yozuvlari</li>
            <li>Kirim hujjatlari va ombor harakatlari</li>
            <li>Mahsulot stoklari → 0 ta</li>
          </ul>
        </div>
      </div>

      <label className="block mt-4 text-xs sm:text-sm font-medium text-gray-800">
        Tasdiqlash uchun &quot;RESET&quot; yozing:
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="RESET"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="mt-1.5 block w-full rounded-xl border-2 border-red-200 bg-white px-4 h-12 text-base font-mono tracking-widest text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-400"
        />
      </label>

      <Button
        type="button"
        onClick={handleReset}
        disabled={!canFire}
        className="mt-4 w-full h-12 text-sm sm:text-base font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Tozalanmoqda...' : 'Test ma\'lumotlarini tozalash'}
      </Button>

      {lastResult && (
        <div className="mt-4 rounded-xl bg-white border border-gray-200 p-3 sm:p-4">
          <p className="text-[13px] font-semibold text-gray-800 mb-2">
            Oxirgi tozalash natijasi
            {typeof lastResult.durationMs === 'number'
              ? ` (${(lastResult.durationMs / 1000).toFixed(1)}s)`
              : ''}
          </p>
          <ul className="text-[12px] sm:text-[13px] text-gray-700 space-y-1">
            {Object.entries(lastResult.cleared || {}).map(([key, count]) => (
              <li key={key} className="flex justify-between gap-2">
                <span className="truncate">{COLLECTION_LABELS[key] || key}</span>
                <span className={`tabular-nums font-semibold ${count < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {count < 0 ? 'xato' : `${count} ta`}
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-2 pt-1.5 border-t border-gray-100">
              <span>Mahsulot stoklari 0 ga tushirildi</span>
              <span className={`tabular-nums font-semibold ${lastResult.productsZeroed < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {lastResult.productsZeroed < 0 ? 'xato' : `${lastResult.productsZeroed} ta`}
              </span>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
};

export default ResetTestDataPanel;
