"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A real slot-machine reel: the items sit on the surface of a cylinder that
// turns around a horizontal axis (perspective + rotateX + translateZ), so
// they curve away and darken towards the top and bottom edges. It rolls
// both ways by dragging (touch or mouse), by the mouse wheel, by tapping an
// item above or below, or with the arrow keys — with momentum, friction and
// a soft click-stop on each detent (and a short vibration on phones).

export interface WheelItem {
  key: string;
  num: string;
  label: string;
  tone: string; // colour when centred
  done?: boolean;
  // done = already happened (grey, ticked, struck) · ahead = beyond the next
  // one in line (amber, skip glyph) · next = the one in line (vivid, glow)
  state?: "done" | "ahead" | "next";
}

const ITEM_H = 46; // px between detents on the front face
const STEP = 22; // degrees between items on the cylinder
const RADIUS = ITEM_H / 2 / Math.tan((STEP / 2) * (Math.PI / 180)); // ≈118px
const VISIBLE = 80; // degrees either side that still render

export default function Wheel3D({
  items,
  index,
  onChange,
  onTapCentre,
  accent,
  height = 220,
}: {
  items: WheelItem[];
  index: number;
  onChange: (i: number) => void;
  onTapCentre?: (i: number, x: number, y: number) => void;
  accent: string;
  height?: number;
}) {
  const [pos, setPos] = useState(index); // continuous position in item units
  const posRef = useRef(index);
  const raf = useRef<number | null>(null);
  const lastDetent = useRef(Math.round(index));
  const settled = useRef(true);
  const max = Math.max(0, items.length - 1);

  // haptics only after a real touch/drag — browsers block it before a gesture
  const touched = useRef(false);
  const set = useCallback((p: number) => {
    posRef.current = p;
    setPos(p);
    const d = Math.round(p);
    if (d !== lastDetent.current && d >= 0 && d <= max) {
      lastDetent.current = d;
      if (touched.current) {
        try {
          navigator.vibrate?.(6);
        } catch {
          /* no haptics */
        }
      }
    }
  }, [max]);

  // follow external index changes (e.g., another drum was added with a target)
  useEffect(() => {
    if (settled.current && Math.round(posRef.current) !== index) animateTo(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const cancelAnim = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  // ease-out glide to a detent, then report it
  const animateTo = useCallback(
    (target: number, duration = 420) => {
      cancelAnim();
      const t0 = performance.now();
      const from = posRef.current;
      const to = Math.max(0, Math.min(max, Math.round(target)));
      settled.current = false;
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / duration);
        const e = 1 - Math.pow(1 - k, 3);
        set(from + (to - from) * e);
        if (k < 1) raf.current = requestAnimationFrame(tick);
        else {
          settled.current = true;
          set(to);
          onChange(to);
        }
      };
      raf.current = requestAnimationFrame(tick);
    },
    [max, onChange, set]
  );

  // momentum after a fling: decelerate, then snap
  const fling = useCallback(
    (velocity: number) => {
      // velocity in items per ms; friction per frame
      cancelAnim();
      let v = velocity;
      let last = performance.now();
      settled.current = false;
      const tick = (now: number) => {
        const dt = now - last;
        last = now;
        let p = posRef.current + v * dt;
        // rubber band at the ends
        if (p < 0) {
          p = p * 0.4;
          v *= 0.5;
        } else if (p > max) {
          p = max + (p - max) * 0.4;
          v *= 0.5;
        }
        set(p);
        v *= Math.pow(0.94, dt / 16);
        if (Math.abs(v) > 0.0006) raf.current = requestAnimationFrame(tick);
        else animateTo(posRef.current, 260);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [animateTo, max, set]
  );

  useEffect(() => () => cancelAnim(), []);

  // ---- drag (touch + mouse) ----
  const drag = useRef<{ y: number; pos: number; t: number; v: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    touched.current = true;
    cancelAnim();
    settled.current = false;
    drag.current = { y: e.clientY, pos: posRef.current, t: performance.now(), v: 0, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const p = d.pos - (e.clientY - d.y) / ITEM_H; // drag down → earlier items
    const dt = Math.max(1, now - d.t);
    d.v = 0.6 * d.v + 0.4 * ((p - posRef.current) / dt);
    d.t = now;
    if (Math.abs(e.clientY - d.y) > 3) d.moved = true;
    // rubber band beyond the ends
    const clamped = p < 0 ? p * 0.35 : p > max ? max + (p - max) * 0.35 : p;
    set(clamped);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // a tap: on the centre item → details; above/below → roll there
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offset = (e.clientY - (rect.top + rect.height / 2)) / ITEM_H;
      const target = Math.round(posRef.current + offset);
      if (Math.abs(offset) < 0.5) onTapCentre?.(Math.round(posRef.current), e.clientX, e.clientY);
      else animateTo(target);
      settled.current = true;
      return;
    }
    if (Math.abs(d.v) > 0.002) fling(d.v);
    else animateTo(posRef.current, 260);
  };

  // ---- mouse wheel: one detent per notch, both directions ----
  // (a native, non-passive listener: React's wheel handler is passive, so it
  // could not stop the page from scrolling under the reel)
  const boxRef = useRef<HTMLDivElement | null>(null);
  const wheelAcc = useRef(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAcc.current += e.deltaY;
      if (Math.abs(wheelAcc.current) >= 40) {
        const dir = wheelAcc.current > 0 ? 1 : -1;
        wheelAcc.current = 0;
        animateTo(Math.round(posRef.current) + dir, 300);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [animateTo]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") animateTo(Math.round(posRef.current) + 1, 300);
    if (e.key === "ArrowUp") animateTo(Math.round(posRef.current) - 1, 300);
  };

  return (
    <div
      ref={boxRef}
      role="listbox"
      tabIndex={0}
      aria-activedescendant={items[Math.round(pos)]?.key}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKey}
      className="relative select-none overflow-hidden outline-none"
      style={{ height, touchAction: "none", cursor: drag.current ? "grabbing" : "grab", perspective: 640, perspectiveOrigin: "50% 50%" }}
    >
      {/* the cylinder's shading: darker towards the rims, a glass band at the front */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20" style={{ background: "linear-gradient(to bottom, rgba(46,36,56,0.28) 0%, rgba(46,36,56,0.05) 32%, rgba(255,255,255,0) 50%, rgba(46,36,56,0.05) 68%, rgba(46,36,56,0.28) 100%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 rounded-xl" style={{ height: ITEM_H + 6, border: `2px solid ${accent}66`, background: `linear-gradient(to bottom, ${accent}0d, ${accent}22 50%, ${accent}0d)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 1px rgba(255,255,255,0.35)` }} />

      {/* the items on the cylinder */}
      <div className="absolute inset-x-0 top-1/2" style={{ transformStyle: "preserve-3d", height: 0 }}>
        {items.map((it, i) => {
          const theta = (i - pos) * STEP; // degrees away from the front
          if (Math.abs(theta) > VISIBLE) return null;
          const rad = (theta * Math.PI) / 180;
          const depth = Math.cos(rad); // 1 at the front, 0 at the rims
          const centred = Math.abs(i - pos) < 0.5;
          return (
            <div
              key={it.key}
              id={it.key}
              role="option"
              aria-selected={centred}
              className="absolute inset-x-0 flex flex-col items-center justify-center text-center"
              style={{
                height: ITEM_H,
                top: -ITEM_H / 2,
                transform: `rotateX(${-theta}deg) translateZ(${RADIUS}px)`,
                backfaceVisibility: "hidden",
                opacity: 0.25 + 0.75 * Math.max(0, depth),
                color: centred ? it.tone : "var(--primary)",
                filter: centred ? "none" : `brightness(${0.75 + 0.25 * depth})`,
                transition: "color 0.2s",
              }}
            >
              <span
                className="font-display text-xl font-extrabold leading-5"
                style={{
                  transform: `scale(${0.8 + 0.25 * depth})`,
                  textDecoration: it.state === "done" ? "line-through" : "none",
                  textDecorationThickness: 2,
                  textShadow: centred && it.state === "next" ? `0 0 14px ${it.tone}66` : "none",
                }}
              >
                {it.state === "done" ? "✓ " : it.state === "ahead" ? "⏭ " : ""}
                {it.num}
              </span>
              <span className="line-clamp-1 w-full px-2 text-[10px] font-semibold leading-3" style={{ opacity: 0.55 + 0.45 * depth, textDecoration: it.state === "done" ? "line-through" : "none" }}>
                {it.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
