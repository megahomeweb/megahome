"use client";

/**
 * Promo code manager — admin UI to create / edit / disable promo codes.
 *
 * Real Firestore data flow:
 *   - Read: real-time onSnapshot on promoCodes collection
 *   - Create: addDoc with normalized uppercase code + initial counters
 *   - Toggle active / delete: updateDoc / deleteDoc (admin-gated by rules)
 *   - Atomic redemption happens server-side in /api/orders/create
 */

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
  orderBy,
  where,
  getDocs,
} from "firebase/firestore";
import { fireDB } from "@/firebase/config";
import type { PromoCode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import PanelTitle from "@/components/admin/PanelTitle";
import {
  Plus,
  X,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Tag,
  Percent,
  CheckCircle2,
  Clock3,
  Users,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatNumber } from "@/lib/formatPrice";

interface PromoDoc extends PromoCode {
  _ref?: string;
}

export default function PromoManager() {
  const [codes, setCodes] = useState<PromoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const q = query(collection(fireDB, "promoCodes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as PromoCode), id: d.id }));
        setCodes(list);
        setLoading(false);
      },
      (err) => {
        console.error("PromoManager onSnapshot error:", err);
        toast.error("Promo kodlarni o'qishda xatolik");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const active = codes.filter((c) => c.active).length;
    const expired = codes.filter((c) => c.expiresAt && (c.expiresAt as Timestamp).toMillis?.() < Date.now()).length;
    const totalRedemptions = codes.reduce((s, c) => s + (c.totalUsed || 0), 0);
    return { total: codes.length, active, expired, totalRedemptions };
  }, [codes]);

  const handleToggle = async (c: PromoDoc) => {
    try {
      await updateDoc(doc(fireDB, "promoCodes", c.id), { active: !c.active });
      toast.success(c.active ? "Faolsizlantirildi" : "Faollashtirildi");
    } catch (err) {
      console.error(err);
      toast.error("Yangilanmadi");
    }
  };

  const handleDelete = async (c: PromoDoc) => {
    if (!window.confirm(`"${c.code}" kodini oʻchirishni istaysizmi?`)) return;
    try {
      await deleteDoc(doc(fireDB, "promoCodes", c.id));
      toast.success("O'chirildi");
    } catch (err) {
      console.error(err);
      toast.error("O'chirilmadi");
    }
  };

  return (
    <div>
      <PanelTitle title="Promo kodlar" />

      <div className="px-4 max-w-6xl mx-auto pb-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard icon={<Tag className="size-4" />} label="Jami" value={stats.total} color="blue" />
          <StatCard icon={<CheckCircle2 className="size-4" />} label="Faol" value={stats.active} color="green" />
          <StatCard icon={<Clock3 className="size-4" />} label="Muddati tugagan" value={stats.expired} color="amber" />
          <StatCard icon={<Users className="size-4" />} label="Ishlatilgan" value={stats.totalRedemptions} color="purple" />
        </div>

        {/* Create button */}
        <div className="flex justify-end">
          <Button
            onClick={() => setShowCreate(true)}
            className="h-10 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold gap-1.5 shadow-sm shadow-blue-500/25"
          >
            <Plus className="size-4" />
            Yangi promo kod
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-center py-12 text-gray-400 text-sm">Yuklanmoqda...</p>
        ) : codes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Tag className="size-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Hech qanday promo kod yo&apos;q</p>
            <p className="text-xs mt-1">Yangi kod yarating va Telegram botida sotuvlarni oshiring</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {codes.map((c) => (
              <PromoCard key={c.id} code={c} onToggle={() => handleToggle(c)} onDelete={() => handleDelete(c)} />
            ))}
          </div>
        )}

        {/* Help footer */}
        <p className="text-xs text-gray-400 text-center">
          📣 Promo kodlar Telegram botida <b>/promo KOD</b> orqali ishlatiladi.
          Server tomonida atomik tarzda qoʻllaniladi (uchish/limit oshib ketishi mumkin emas).
        </p>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          existingCodes={codes.map((c) => c.code.toUpperCase())}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "green" | "amber" | "purple";
}) {
  const map = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className={`size-8 rounded-lg flex items-center justify-center mb-2 ${map[color]}`}>{icon}</div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function PromoCard({ code, onToggle, onDelete }: { code: PromoDoc; onToggle: () => void; onDelete: () => void }) {
  const expired = code.expiresAt && (code.expiresAt as Timestamp).toMillis?.() < Date.now();
  const exhausted = code.maxUsesTotal > 0 && code.totalUsed >= code.maxUsesTotal;
  const status = !code.active ? "off" : expired ? "expired" : exhausted ? "exhausted" : "live";
  const statusBadge: Record<string, string> = {
    live: "bg-emerald-100 text-emerald-700 border-emerald-200",
    off: "bg-gray-100 text-gray-500 border-gray-200",
    expired: "bg-amber-100 text-amber-700 border-amber-200",
    exhausted: "bg-red-100 text-red-700 border-red-200",
  };
  const statusLabel: Record<string, string> = {
    live: "Faol",
    off: "Faolsiz",
    expired: "Muddati tugagan",
    exhausted: "Limit tugagan",
  };

  return (
    <div className={`bg-white rounded-2xl border p-4 ${status === "live" ? "border-emerald-200" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold text-gray-900 font-mono tracking-wider">{code.code}</p>
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mt-0.5">{code.notes || "—"}</p>
        </div>
        <span className={`text-[10px] font-bold uppercase rounded-md border px-1.5 py-0.5 ${statusBadge[status]}`}>
          {statusLabel[status]}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        {code.type === "pct" ? (
          <span className="text-3xl font-extrabold text-blue-600 tabular-nums">−{code.value}%</span>
        ) : (
          <>
            <span className="text-2xl font-extrabold text-blue-600 tabular-nums">−{formatNumber(code.value)}</span>
            <span className="text-xs text-gray-500">soʻm</span>
          </>
        )}
      </div>

      <div className="space-y-1 text-xs text-gray-600 mb-3">
        {code.minOrderTotal > 0 && (
          <div className="flex justify-between">
            <span>Min buyurtma:</span>
            <span className="font-semibold text-gray-900 tabular-nums">{formatNumber(code.minOrderTotal)} soʻm</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Foydalanish:</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {code.totalUsed} / {code.maxUsesTotal > 0 ? code.maxUsesTotal : "∞"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Mijozga limit:</span>
          <span className="font-semibold text-gray-900 tabular-nums">{code.maxUsesPerUser}×</span>
        </div>
        {code.expiresAt && (
          <div className="flex justify-between">
            <span>Muddat:</span>
            <span className="font-semibold text-gray-900">
              {(code.expiresAt as Timestamp).toDate?.().toLocaleDateString("uz-UZ") || "—"}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 pt-3 border-t border-gray-100">
        <Button
          onClick={onToggle}
          variant="outline"
          className="flex-1 rounded-lg h-9 text-xs gap-1.5"
        >
          {code.active ? <ToggleRight className="size-3.5 text-emerald-500" /> : <ToggleLeft className="size-3.5 text-gray-400" />}
          {code.active ? "Faolsizlantirish" : "Faollashtirish"}
        </Button>
        <Button
          onClick={onDelete}
          variant="ghost"
          size="icon"
          className="size-9 text-red-400 hover:bg-red-50 hover:text-red-600"
          aria-label="O'chirish"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CreateModal({
  onClose,
  existingCodes,
}: {
  onClose: () => void;
  existingCodes: string[];
}) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"pct" | "abs">("pct");
  const [value, setValue] = useState<number>(10);
  const [minOrderTotal, setMinOrderTotal] = useState<number>(0);
  const [maxUsesTotal, setMaxUsesTotal] = useState<number>(0);
  const [maxUsesPerUser, setMaxUsesPerUser] = useState<number>(1);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const codeUpper = code.trim().toUpperCase();
    if (!codeUpper) return toast.error("Kod kiriting");
    if (codeUpper.length < 3) return toast.error("Kod kamida 3 belgi");
    if (codeUpper.length > 24) return toast.error("Kod 24 belgidan katta");
    if (!/^[A-Z0-9_-]+$/.test(codeUpper)) return toast.error("Faqat A-Z, 0-9, _, -");
    if (existingCodes.includes(codeUpper)) return toast.error("Bunday kod allaqachon mavjud");
    if (value <= 0) return toast.error("Qiymat 0 dan katta boʻlishi kerak");
    if (type === "pct" && value > 100) return toast.error("% 100 dan oshmaydi");

    setSaving(true);
    try {
      // Defensive: server-side dedupe check (rules allow auth users to read)
      const dup = await getDocs(query(collection(fireDB, "promoCodes"), where("code", "==", codeUpper)));
      if (!dup.empty) {
        toast.error("Bunday kod allaqachon mavjud");
        return;
      }
      await addDoc(collection(fireDB, "promoCodes"), {
        code: codeUpper,
        type,
        value,
        minOrderTotal: Math.max(0, minOrderTotal),
        maxUsesTotal: Math.max(0, maxUsesTotal),
        maxUsesPerUser: Math.max(1, maxUsesPerUser),
        usedBy: {},
        totalUsed: 0,
        active: true,
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
        notes: notes.trim() || null,
        createdAt: serverTimestamp(),
      });
      toast.success(`"${codeUpper}" yaratildi`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Saqlanmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Yopish"
          className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg active:scale-95 transition"
        >
          <X className="size-5 text-gray-500" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-1">Yangi promo kod</h2>
        <p className="text-xs text-gray-500 mb-4">
          Mijoz Telegram botida <code className="bg-gray-100 px-1 rounded">/promo KOD</code> kiritadi
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">Kod</label>
            <input
              type="text"
              autoFocus
              placeholder="WELCOME10"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-mono uppercase tracking-wider outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">Chegirma turi</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setType("pct")}
                className={`px-3 py-2.5 rounded-lg border-2 text-sm font-bold transition ${
                  type === "pct" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                <Percent className="size-3.5 inline mr-1" /> Foiz (%)
              </button>
              <button
                onClick={() => setType("abs")}
                className={`px-3 py-2.5 rounded-lg border-2 text-sm font-bold transition ${
                  type === "abs" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                soʻm (UZS)
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">
              Qiymat ({type === "pct" ? "%, 1-100" : "UZS"})
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={type === "pct" ? 100 : 100_000_000}
              value={value || ""}
              onChange={(e) => setValue(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">Min buyurtma</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={minOrderTotal || ""}
                onChange={(e) => setMinOrderTotal(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">Jami limit (0=∞)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={maxUsesTotal || ""}
                onChange={(e) => setMaxUsesTotal(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">Mijozga limit</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={maxUsesPerUser || ""}
                onChange={(e) => setMaxUsesPerUser(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">Muddat</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1">Izoh (ixtiyoriy)</label>
            <input
              type="text"
              placeholder="Telegram kanal kampaniyasi"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 80))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 flex gap-2 text-xs text-blue-800">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>Kod yaratilgach, mijozlarga botda <b>/promo {code || "KOD"}</b> orqali bering. Server limitlarni avtomatik tekshiradi.</p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !code.trim() || value <= 0}
          className="w-full mt-5 h-11 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl"
        >
          <Calendar className="size-4 mr-1" />
          {saving ? "Saqlanmoqda..." : "Yaratish"}
        </Button>
      </div>
    </div>
  );
}
