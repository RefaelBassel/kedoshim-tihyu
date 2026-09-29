"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A real slot-machine reel. The items are printed on the surface of a
// cylinder that turns around a horizontal axis (perspective + rotateX +
// translateZ). The reel is ENDLESS: the sequence repeats around the drum,
// so rolling past the last unit brings the first one round again and the
// window is always full — every unit is on the drum at once. The drum has
// a skin (grooves that turn with it), cylindrical lighting, a glass window
// with a reflection, payline pointers, and mechanics: momentum, friction,
// click-stops with a small spring overshoot, motion blur while spinning.
// It rolls by dragging (touch or mouse), mouse wheel, tapping an item above
// or below, or arrow keys. A horizontal drag is handed to the parent.

export interface WheelItem {
  key: string;
  num: string;
  label: string;
  tone: string; // colour when centred
  done?: boolean;
  // done = already happened (grey, ticked, struck) · ahead = beyond the next
  // one in line (amber, skip glyph) · next = the one in line (vivid, glow)
  state?: "done" | "ahead" | "next";
  // not yet given to the class — printed hollow, the popover offers to assign
  unassigned?: boolean;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export default function Wheel3D({
  items,
  index,
  onChange,
  onTapCentre,
  accent,
  itemHeight = 46,
  compact = false,
  height = 230,
  mini = false,
  onReorderStart,
  onReorderMove,
  onReorderEnd,
}: {
  items: WheelItem[];
  index: number;
  onChange: (i: number) => void;
  onTapCentre?: (i: number, x: number, y: number) => void;
  accent: string;
  itemHeight?: number;
  compact?: boolean;
  height?: number;
  mini?: boolean;
  // a HORIZONTAL drag on the reel is handed to the parent (reordering the
  // reels); a vertical one rolls. The axis is decided on the first real move.
  onReorderStart?: (e: React.PointerEvent) => void;
  onReorderMove?: (e: React.PointerEvent) => void;
  onReorderEnd?: () => void;
}) {
  const n = Math.max(1, items.length);
  // ---- geometry: the sequence is repeated around the drum so that the
  // detents are ~24° apart (15 slots for a 5-unit reel = 3 copies). With
  // many units the drum simply grows (one copy, smaller step, larger radius).
  const copies = Math.max(1, Math.round(15 / n));
  const slots = copies * n;
  const STEP = 360 / slots;
  const ITEM_H = itemHeight;
  const RADIUS = ITEM_H / 2 / Math.tan((STEP / 2) * (Math.PI / 180));
  const cyclic = n >= 2;

  const [pos, setPos] = useState(index);
  const [blur, setBlur] = useState(0);
  const posRef = useRef(index);
  const raf = useRef<number | null>(null);
  const lastDetent = useRef(Math.round(index));
  const settled = useRef(true);
  const max = Math.max(0, n - 1);

  // haptics only after a real touch/drag — browsers block it before a gesture
  const touched = useRef(false);
  const set = useCallback((p: number, velocity = 0) => {
    posRef.current = p;
    setPos(p);
    // motion blur grows with speed (slots per ms → px)
    setBlur(Math.min(2.6, Math.abs(velocity) * 90));
    const d = Math.round(p);
    if (d !== lastDetent.current) {
      lastDetent.current = d;
      if (touched.current) {
        try {
          navigator.vibrate?.(5);
        } catch {
          /* no haptics */
        }
      }
    }
  }, []);

  const cancelAnim = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const clampPos = useCallback((p: number) => (cyclic ? p : Math.max(0, Math.min(max, p))), [cyclic, max]);

  // glide into a detent with a small mechanical overshoot (a click-stop)
  const animateTo = useCallback(
    (target: number, duration = 420, overshoot = 0.9) => {
      cancelAnim();
      const t0 = performance.now();
      const from = posRef.current;
      const to = clampPos(Math.round(target));
      settled.current = false;
      const c1 = overshoot;
      const c3 = c1 + 1;
      let lastP = from;
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / duration);
        const e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
        const p = from + (to - from) * e;
        set(p, (p - lastP) / 16);
        lastP = p;
        if (k < 1) raf.current = requestAnimationFrame(tick);
        else {
          settled.current = true;
          set(to, 0);
          onChange(mod(to, n));
        }
      };
      raf.current = requestAnimationFrame(tick);
    },
    [clampPos, n, onChange, set]
  );

  // the parent moved the index: roll the shortest way round to it
  useEffect(() => {
    if (!settled.current) return;
    const cur = posRef.current;
    if (mod(Math.round(cur), n) === mod(index, n)) return;
    let target = index;
    if (cyclic) {
      const base = Math.round(cur);
      let best = Infinity;
      for (let k = -1; k <= 1; k++) {
        const cand = index + (Math.floor(base / n) + k) * n;
        if (Math.abs(cand - cur) < best) {
          best = Math.abs(cand - cur);
          target = cand;
        }
      }
    }
    animateTo(target, 520, 0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const fling = useCallback(
    (velocity: number) => {
      cancelAnim();
      let v = velocity;
      let last = performance.now();
      settled.current = false;
      const tick = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        let p = posRef.current + v * dt;
        if (!cyclic) {
          if (p < 0) {
            p = p * 0.4;
            v *= 0.5;
          } else if (p > max) {
            p = max + (p - max) * 0.4;
            v *= 0.5;
          }
        }
        set(p, v);
        v *= Math.pow(0.945, dt / 16);
        // the detent "teeth" catch the drum once it is slow: pull towards
        // the nearest stop so it never dies between two units
        if (Math.abs(v) < 0.004) {
          const nearest = Math.round(p);
          v += (nearest - p) * 0.0009 * dt;
        }
        if (Math.abs(v) > 0.0008) raf.current = requestAnimationFrame(tick);
        else animateTo(posRef.current, 300, 1.1);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [animateTo, cyclic, max, set]
  );

  useEffect(() => () => cancelAnim(), []);

  // ---- drag: roll (vertical) or reorder (horizontal) ----
  const drag = useRef<{ x: number; y: number; pos: number; t: number; v: number; moved: boolean; mode: "undecided" | "roll" | "reorder" } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    touched.current = true;
    cancelAnim();
    settled.current = false;
    drag.current = { x: e.clientX, y: e.clientY, pos: posRef.current, t: performance.now(), v: 0, moved: false, mode: "undecided" };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "undecided") {
      const ax = Math.abs(e.clientX - d.x);
      const ay = Math.abs(e.clientY - d.y);
      if (ax < 5 && ay < 5) return;
      // sideways wins whenever it is at least ~2/3 of the vertical travel:
      // a real finger starts a horizontal drag with a diagonal wobble
      if (ax * 1.5 > ay && onReorderStart) {
        d.mode = "reorder";
        settled.current = true;
        onReorderStart(e);
        return;
      }
      d.mode = "roll";
    }
    if (d.mode === "reorder") {
      onReorderMove?.(e);
      return;
    }
    const now = performance.now();
    const p = d.pos - (e.clientY - d.y) / ITEM_H;
    const dt = Math.max(1, now - d.t);
    d.v = 0.6 * d.v + 0.4 * ((p - posRef.current) / dt);
    d.t = now;
    if (Math.abs(e.clientY - d.y) > 3) d.moved = true;
    if (cyclic) set(p, d.v);
    else set(p < 0 ? p * 0.35 : p > max ? max + (p - max) * 0.35 : p, d.v);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "reorder") {
      onReorderEnd?.();
      return;
    }
    if (!d.moved) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offset = (e.clientY - (rect.top + rect.height / 2)) / ITEM_H;
      if (Math.abs(offset) < 0.5) {
        onTapCentre?.(mod(Math.round(posRef.current), n), e.clientX, e.clientY);
        settled.current = true;
      } else animateTo(Math.round(posRef.current + offset), 380, 1.0);
      return;
    }
    if (Math.abs(d.v) > 0.002) fling(d.v);
    else animateTo(posRef.current, 300, 1.1);
  };

  // ---- mouse wheel (native, non-passive) ----
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
        animateTo(Math.round(posRef.current) + dir, 320, 1.0);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [animateTo]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") animateTo(Math.round(posRef.current) + 1, 320, 1.0);
    if (e.key === "ArrowUp") animateTo(Math.round(posRef.current) - 1, 320, 1.0);
  };

  // ---- what is on the front half of the drum right now ----
  // slot s carries item s % n; its angle from the front is (s - pos) * STEP.
  // The centred slot is the one nearest 0°.
  const centreSlot = Math.round(pos);
  const visible: { slot: number; item: WheelItem; theta: number; copy: number }[] = [];
  const range = Math.ceil(95 / STEP);
  for (let s = centreSlot - range; s <= centreSlot + range; s++) {
    const theta = (s - pos) * STEP;
    if (Math.abs(theta) > 92) continue;
    if (!cyclic && (s < 0 || s > max)) continue;
    visible.push({ slot: s, item: items[mod(s, n)], theta, copy: Math.floor(s / n) });
  }
  // separator grooves between the printed strips, turning with the drum
  const grooves: number[] = [];
  for (let s = centreSlot - range; s <= centreSlot + range; s++) {
    const theta = (s - pos + 0.5) * STEP;
    if (Math.abs(theta) <= 92) grooves.push(theta);
  }
  const centredIdx = mod(centreSlot, n);
  const blurring = blur > 0.15;

  return (
    <div
      ref={boxRef}
      role="listbox"
      tabIndex={0}
      aria-activedescendant={items[centredIdx]?.key}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // the click that follows a tap must not reach the page's "close the
      // popover" handler, and a right click is not the browser's business here
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKey}
      className="relative select-none overflow-hidden outline-none"
      style={{
        height,
        touchAction: "none",
        cursor: "grab",
        perspective: mini ? 420 : 640,
        perspectiveOrigin: "50% 50%",
        // the cabinet behind the drum
        background: "#241c2c",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 6px 14px rgba(0,0,0,0.55), inset 0 -6px 14px rgba(0,0,0,0.55)",
      }}
    >
      {/* the drum body: a lit cylinder — a soft specular band just above the
          front, falling to dark at the rims; brushed texture across it */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0.5 inset-y-0"
        style={{
          background:
            "linear-gradient(to bottom, #3a3040 0%, #7a6f80 7%, #bfb6c1 20%, #efe9ea 38%, #fffdfb 46%, #f6f1ef 52%, #e6dfdf 62%, #b8afb9 80%, #7a6f80 93%, #3a3040 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0.5 inset-y-0 opacity-[0.16]"
        style={{ background: "repeating-linear-gradient(90deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 3px)" }}
      />

      {/* the printed strips and the grooves between them, on the cylinder */}
      <div className="absolute inset-x-0 top-1/2" style={{ transformStyle: "preserve-3d", height: 0, transform: `translateZ(${-RADIUS}px)` }}>
        {grooves.map((theta) => {
          const depth = Math.cos((theta * Math.PI) / 180);
          return (
            <div
              key={`g${theta.toFixed(2)}`}
              aria-hidden
              className="pointer-events-none absolute inset-x-1"
              style={{
                height: 2,
                top: -1,
                transform: `rotateX(${-theta}deg) translateZ(${RADIUS}px)`,
                background: `rgba(46,36,56,${0.08 + 0.18 * (1 - depth)})`,
                boxShadow: "0 1px 0 rgba(255,255,255,0.6)",
                backfaceVisibility: "hidden",
              }}
            />
          );
        })}
        {visible.map(({ slot, item: it, theta, copy }) => {
          const depth = Math.cos((theta * Math.PI) / 180);
          const centred = slot === centreSlot;
          const dim = 1 - depth; // 0 at the front, 1 at the rim
          return (
            <div
              key={`${it.key}-c${copy}`}
              id={centred ? it.key : undefined}
              role="option"
              aria-selected={centred}
              className="absolute inset-x-0 flex flex-col items-center justify-center text-center"
              style={{
                height: ITEM_H,
                top: -ITEM_H / 2,
                transform: `rotateX(${-theta}deg) translateZ(${RADIUS}px)`,
                backfaceVisibility: "hidden",
                opacity: 0.25 + 0.75 * Math.max(0, depth),
                color: centred ? it.tone : `rgba(70,58,80,${1 - 0.35 * dim})`,
                transition: "color 0.2s",
                filter: blurring ? `blur(${blur.toFixed(2)}px)` : undefined,
                // the print sits ON the paper: a faint ink shadow that deepens at the rims
                textShadow: `0 1px 0 rgba(255,255,255,0.6), 0 0 ${1 + 2 * dim}px rgba(46,36,56,${0.15 + 0.25 * dim})`,
              }}
            >
              <span
                className={`font-display font-extrabold ${mini ? "text-base leading-4" : "text-xl leading-5"}`}
                style={{
                  transform: `scaleY(${0.92 + 0.08 * depth})`,
                  textDecorationLine: it.state === "done" ? "line-through" : "none",
                  textDecorationThickness: 2,
                  textShadow: centred && it.state === "next" ? `0 0 14px ${it.tone}77, 0 1px 0 rgba(255,255,255,0.6)` : undefined,
                  // not yet given to the class: hollow print
                  WebkitTextStroke: it.unassigned ? "1px currentColor" : undefined,
                  WebkitTextFillColor: it.unassigned ? "transparent" : undefined,
                }}
              >
                {it.state === "done" ? "✓ " : it.state === "ahead" ? "⏭ " : ""}
                {it.num}
              </span>
              <span className={`line-clamp-1 w-full font-semibold ${compact ? "px-0.5 text-[8px] leading-3" : mini ? "px-1 text-[9px] leading-3" : "px-2 text-[10px] leading-3"}`} style={{ opacity: 0.6 + 0.4 * depth, textDecorationLine: it.state === "done" ? "line-through" : "none" }}>
                {it.unassigned ? "📣 " : ""}
                {it.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* rim shadows: the cylinder curves away at the top and bottom, and the
          cabinet walls shade its sides */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[30%]" style={{ background: "linear-gradient(to bottom, rgba(16,10,22,0.75), rgba(16,10,22,0.28) 45%, rgba(16,10,22,0))" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[30%]" style={{ background: "linear-gradient(to top, rgba(16,10,22,0.75), rgba(16,10,22,0.28) 45%, rgba(16,10,22,0))" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ background: "linear-gradient(to right, rgba(16,10,22,0.35), rgba(16,10,22,0) 10%, rgba(16,10,22,0) 90%, rgba(16,10,22,0.35))" }} />

      {/* glass window over the front detent: bezel, tint, a curved reflection */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-1 top-1/2 z-20 -translate-y-1/2 rounded-md"
        style={{
          height: ITEM_H + 6,
          border: `2px solid ${accent}`,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 8px 10px -8px rgba(255,255,255,0.9), 0 0 0 1px rgba(0,0,0,0.25), 0 0 16px -2px ${accent}55`,
          background: `linear-gradient(to bottom, ${accent}0d, ${accent}1f 46%, ${accent}05 54%, ${accent}12)`,
          overflow: "hidden",
        }}
      >
        <div
          className="absolute -left-1/4 -top-full h-[220%] w-1/2 rotate-[18deg]"
          style={{ background: "linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.28), rgba(255,255,255,0))" }}
        />
      </div>
      {/* payline pointers on the cabinet, either side of the window */}
      <div aria-hidden className="pointer-events-none absolute left-0 top-1/2 z-20 -translate-y-1/2" style={{ borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: `6px solid ${accent}` }} />
      <div aria-hidden className="pointer-events-none absolute right-0 top-1/2 z-20 -translate-y-1/2" style={{ borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: `6px solid ${accent}` }} />
    </div>
  );
}
