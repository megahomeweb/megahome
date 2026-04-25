"use client";
/**
 * iPhone-home-screen-style swipe navigation between the four main admin
 * tabs (Bosh sahifa → Mahsulotlar → Buyurtmalar → Faktura).
 *
 * Behaviour (mobile only, viewport < lg):
 *   - Drag the page horizontally; finger-follow with light elastic resistance.
 *   - Release past the threshold (or with enough velocity) → navigate to the
 *     adjacent tab and play a slide-in animation on the incoming page.
 *   - Release below threshold → spring back to 0, no navigation.
 *   - Vertical scroll is preserved via `touch-action: pan-y` on the wrapper;
 *     framer-motion's drag="x" only grabs horizontal gestures.
 *
 * Opt-outs — any descendant with `data-no-swipe` swallows the pointerdown so
 * the outer drag never starts. Use this on horizontally-scrollable rows
 * (action chip bars, wide tables, carousels) and inside open modals.
 */
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";

// Single source of truth — must match the main-tab order in BottomNav.tsx
const TAB_ORDER = [
  "/admin",
  "/admin/sotuv",
  "/admin/orders",
  "/admin/products",
] as const;

const SWIPE_PX_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 400;
const LG_BREAKPOINT = 1024;

type Direction = 1 | -1 | 0;

export default function SwipeableAdminContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dragControls = useDragControls();

  const [isMobile, setIsMobile] = useState(false);
  const directionRef = useRef<Direction>(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < LG_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const normalizedPath = pathname === "/admin/" ? "/admin" : pathname;
  const idx = TAB_ORDER.indexOf(normalizedPath as (typeof TAB_ORDER)[number]);
  const prev = idx > 0 ? TAB_ORDER[idx - 1] : null;
  const next = idx >= 0 && idx < TAB_ORDER.length - 1 ? TAB_ORDER[idx + 1] : null;
  const canSwipe = idx !== -1 && isMobile;

  /**
   * We opt out of drag when the pointer goes down on an interactive /
   * horizontally-scrollable element so chip rows still scroll and inputs
   * still focus normally. Using `useDragControls` with `dragListener=false`
   * lets us make this decision imperatively per-event.
   */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canSwipe) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // Interactive / form / dialog elements: never hijack.
    if (
      target.closest(
        "[data-no-swipe], input, textarea, select, [contenteditable='true'], [role='dialog']",
      )
    ) {
      return;
    }
    // Inline-rendered modals in this codebase use `fixed inset-0` on their
    // outer wrapper — treat them as swipe-off even without role="dialog".
    if (target.closest(".fixed.inset-0")) {
      return;
    }
    dragControls.start(e);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const passThreshold =
      Math.abs(info.offset.x) >= SWIPE_PX_THRESHOLD ||
      Math.abs(info.velocity.x) >= SWIPE_VELOCITY_THRESHOLD;
    if (!passThreshold) return;

    if (info.offset.x < 0 && next) {
      directionRef.current = 1;
      router.push(next);
    } else if (info.offset.x > 0 && prev) {
      directionRef.current = -1;
      router.push(prev);
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      style={canSwipe ? { touchAction: "pan-y" } : undefined}
      className="relative"
    >
      <motion.div
        drag={canSwipe ? "x" : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        dragMomentum={false}
        dragTransition={{ bounceStiffness: 500, bounceDamping: 28 }}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence mode="popLayout" initial={false} custom={directionRef.current}>
          <motion.div
            key={normalizedPath}
            custom={directionRef.current}
            variants={{
              enter: (dir: Direction) => ({
                opacity: 0,
                x: dir === 0 ? 0 : dir * 32,
              }),
              center: { opacity: 1, x: 0 },
              exit: (dir: Direction) => ({
                opacity: 0,
                x: dir === 0 ? 0 : dir * -32,
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
