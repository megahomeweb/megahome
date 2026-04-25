"use client"
import Header from "@/components/client/Header";
import CategorySection from "@/components/client/CategorySection";
import LocationSection from "@/components/client/LocationSection";
import { useRef, useEffect, useMemo } from "react";
import { TimelineContent } from "@/components/ui/timeline-animation";
import useProductStore from "@/store/useProductStore";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import Image from "next/image";
import {
  Package, Truck, Layers,
  ArrowRight, ShieldCheck, BarChart3, Headphones,
} from "lucide-react";

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLElement>(null);
  const { products, fetchProducts } = useProductStore();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const productImages = useMemo(() =>
    products
      .filter(p => p.productImageUrl?.length > 0)
      .map(p => ({ url: p.productImageUrl[0].url, title: p.title, id: p.id }))
      .slice(0, 16),
    [products]
  );

  return (
    <main className="bg-white">
      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section ref={heroRef} className="relative min-h-screen overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-black" />
        <div className="absolute inset-0 bg-[url(/images/banner-2.jpg)] bg-cover bg-center opacity-15" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

        {/* Decorative grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        <Header />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 pt-36 sm:pt-44 pb-20">
          <TimelineContent as="div" animationNum={1} timelineRef={heroRef}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 backdrop-blur-sm px-4 py-1.5 mb-8"
          >
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-gray-300">Ulgurji savdo platformasi</span>
          </TimelineContent>

          <TimelineContent as="h1" animationNum={2} timelineRef={heroRef}
            className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white leading-[1.1] max-w-4xl"
          >
            <span className="text-[#00bad8]">MegaHome</span> — Eng yaxshi{" "}
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
              ulgurji narxlar
            </span>
          </TimelineContent>

          <TimelineContent as="p" animationNum={3} timelineRef={heroRef}
            className="text-lg sm:text-xl text-gray-400 mt-6 max-w-2xl leading-relaxed"
          >
            Uy uchun zarur bo&apos;lgan barcha mahsulotlar bir joyda.
            Naqd bo&apos;lsa — ulgurji bo&apos;laqolsin!
          </TimelineContent>

          <TimelineContent as="div" animationNum={4} timelineRef={heroRef}
            className="flex flex-wrap gap-4 mt-10"
          >
            <Link href="/#category"
              className="group inline-flex items-center gap-2 bg-[#00bad8] hover:bg-[#00a8c4] text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
            >
              Katalogni ko&apos;rish
              <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            {!isAuthenticated && (
              <Link href="/sign-up"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold px-7 py-3.5 rounded-xl border border-white/20 backdrop-blur-sm transition-all duration-300"
              >
                Ro&apos;yxatdan o&apos;tish
              </Link>
            )}
          </TimelineContent>

          {/* Stats */}
          <TimelineContent as="div" animationNum={5} timelineRef={heroRef}
            className="grid grid-cols-3 gap-6 sm:gap-10 mt-16 max-w-lg"
          >
            <StatItem value="500+" label="Mahsulotlar" />
            <StatItem value="20+" label="Kategoriyalar" />
            <StatItem value="1000+" label="Mijozlar" />
          </TimelineContent>
        </div>

        {/* Hero bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
      </section>

      {/* ═══════════════════ PRODUCT SHOWCASE ═══════════════════ */}
      {productImages.length > 0 && (
        <section className="bg-black py-10 sm:py-14 overflow-hidden">
          <div className="scroll-mask">
            <div className="animate-scroll-left flex gap-4 sm:gap-6 w-max">
              {[...productImages, ...productImages].map((img, i) => (
                <Link
                  key={i}
                  href={img.id ? `/product/${img.id}` : "/#category"}
                  className="flex-shrink-0 w-40 h-40 sm:w-56 sm:h-56 lg:w-64 lg:h-64 rounded-2xl overflow-hidden group cursor-pointer relative"
                >
                  <Image
                    src={img.url}
                    alt={img.title}
                    width={256}
                    height={256}
                    className="size-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                    <p className="text-white text-xs sm:text-sm font-medium line-clamp-2">{img.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ CATEGORIES (above the fold on mobile) ═══════════════════ */}
      <CategorySection />

      {/* ═══════════════════ FEATURES / WHY US ═══════════════════ */}
      <section ref={featuresRef} className="bg-gray-50 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <TimelineContent as="div" animationNum={0} timelineRef={featuresRef} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Nima uchun <span className="text-[#00bad8]">MegaHome</span>?
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Bizning platformamiz orqali ulgurji savdoni oson va qulay qiling
            </p>
          </TimelineContent>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            <FeatureCard
              icon={<Package className="size-6" />}
              title="Ulgurji narxlar"
              description="Eng arzon ulgurji narxlarda sifatli mahsulotlar. Chakana narxlardan 30-50% arzon."
              color="cyan"
              timelineRef={featuresRef}
              index={1}
            />
            <FeatureCard
              icon={<ShieldCheck className="size-6" />}
              title="Ishonchli sifat"
              description="Har bir mahsulot sinovdan o'tgan. Xaridorlarimiz 5 yildan beri bizga ishonadi."
              color="amber"
              timelineRef={featuresRef}
              index={2}
            />
            <FeatureCard
              icon={<Truck className="size-6" />}
              title="Tez yetkazish"
              description="Buyurtmangizni tezkor va xavfsiz yetkazib berish. Butun viloyat bo'ylab."
              color="emerald"
              timelineRef={featuresRef}
              index={3}
            />
            <FeatureCard
              icon={<Layers className="size-6" />}
              title="Keng assortiment"
              description="500+ turdagi mahsulotlar. Oshxona, hammom, uy jihozlari — barchasi bir joyda."
              color="violet"
              timelineRef={featuresRef}
              index={4}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════ TRUST SECTION ═══════════════════ */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid sm:grid-cols-3 gap-8">
            <TrustItem
              icon={<ShieldCheck className="size-7 text-emerald-600" />}
              title="Sifat kafolati"
              description="Barcha mahsulotlar sifat tekshiruvidan o'tgan"
            />
            <TrustItem
              icon={<BarChart3 className="size-7 text-blue-600" />}
              title="Shaffof narxlar"
              description="Hech qanday yashirin to'lovlar — aniq va tushunarli"
            />
            <TrustItem
              icon={<Headphones className="size-7 text-violet-600" />}
              title="24/7 qo'llab-quvvatlash"
              description="Telegram orqali tezkor yordam va maslahat"
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA ═══════════════════ */}
      {!isAuthenticated && (
        <section ref={ctaRef} className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-[#003d47] to-gray-900" />
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, #00bad8 0%, transparent 50%), radial-gradient(circle at 80% 50%, #00bad8 0%, transparent 50%)',
          }} />
          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-8 py-20 sm:py-24 text-center">
            <TimelineContent as="h2" animationNum={0} timelineRef={ctaRef}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6"
            >
              Hoziroq boshlang!
            </TimelineContent>
            <TimelineContent as="p" animationNum={1} timelineRef={ctaRef}
              className="text-lg text-gray-300 mb-10 max-w-xl mx-auto"
            >
              Ro&apos;yxatdan o&apos;ting va ulgurji narxlarda xarid qilishni boshlang.
              Minglab mijozlar allaqachon bizni tanlashdi.
            </TimelineContent>
            <TimelineContent as="div" animationNum={2} timelineRef={ctaRef} className="flex flex-wrap justify-center gap-4">
              <Link href="/sign-up"
                className="group inline-flex items-center gap-2 bg-[#00bad8] hover:bg-[#00a8c4] text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 text-lg"
              >
                Bepul ro&apos;yxatdan o&apos;tish
                <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/#category"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold px-8 py-4 rounded-xl border border-white/20 transition-all text-lg"
              >
                Katalogni ko&apos;rish
              </Link>
            </TimelineContent>
          </div>
        </section>
      )}

      {/* ═══════════════════ LOCATION ═══════════════════ */}
      <LocationSection />
    </main>
  );
}

/* ─────────── Sub-components ─────────── */

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl sm:text-3xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function FeatureCard({
  icon, title, description, color, timelineRef, index,
}: {
  icon: React.ReactNode; title: string; description: string;
  color: string;
  timelineRef: React.RefObject<HTMLElement | null>;
  index: number;
}) {
  const colorMap: Record<string, string> = {
    cyan: "bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100",
    violet: "bg-violet-50 text-violet-600 group-hover:bg-violet-100",
  };

  return (
    <TimelineContent as="div" animationNum={index} timelineRef={timelineRef}
      className="group bg-white rounded-2xl p-6 lg:p-8 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300"
    >
      <div className={`inline-flex items-center justify-center size-12 rounded-xl mb-5 transition-colors ${colorMap[color]}`}>
        {icon}
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 leading-relaxed">{description}</p>
    </TimelineContent>
  );
}

function TrustItem({
  icon, title, description,
}: {
  icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="shrink-0 flex items-center justify-center size-14 rounded-2xl bg-white border border-gray-200 shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
