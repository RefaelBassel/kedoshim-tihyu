"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A real slot-machine reel. The items sit on the surface of a cylinder that
// turns around a horizontal axis (perspective + rotateX + translateZ). The
// cylinder has a SKIN — grooves all around it that turn with the items, so
// the drum is visibly rolling even where no item sits — and body lighting:
// a highlight at the front, darkening towards the rims. It rolls both ways
// by dragging (touch or mouse) with momentum, friction and click-stops, by
// the mouse wheel, by tapping an item above or below, or with arrow keys.

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

export default function Wheel3D({
  items,
  index,
  onChange,
  onTapCentre,
  accent,
  itemHeight = 46,
  step = 20,
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
  step?: number; // degrees between detents
  height?: number;
  mini?: boolean;
  // a HORIZONTAL drag on the reel is handed to the parent (reordering the
  // reels); a vertical one rolls. The axis is decided on the first real move.
  onReorderStart?: (e: React.PointerEvent) => void;
  onReorderMove?: (e: React.PointerEvent) => void;
  onReorderEnd?: () => void;
}) {
  const ITEM_H = itemHeight;
  const STEP = step;
  const RADIUS = ITEM_H / 2 / Math.tan((STEP / 2) * (Math.PI / 180));
  const [pos, setPos] = useState(index);
  const posRef = useRef(index);
  const raf = useRef<number | null>(null);
  const lastDetent = useRef(Math.round(index));
  const settled = useRef(true);
  const max = Math.max(0, items.length - 1);

  // haptics only after a real touch/drag — browsers block it before a gesture
  const touched = useRef(false);
  const set = useCallback(
    (p: number) => {
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
    },
    [max]
  );

  const cancelAnim = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

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

  useEffect(() => {
    if (settled.current && Math.round(posRef.current) !== index) animateTo(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const fling = useCallback(
    (velocity: number) => {
      cancelAnim();
      let v = velocity;
      let last = performance.now();
      settled.current = false;
      const tick = (now: number) => {
        const dt = now - last;
        last = now;
        let p = posRef.current + v * dt;
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
      if (ax < 6 && ay < 6) return;
      if (ax > ay && onReorderStart) {
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
    set(p < 0 ? p * 0.35 : p > max ? max + (p - max) * 0.35 : p);
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
      if (Math.abs(offset) < 0.5) onTapCentre?.(Math.round(posRef.current), e.clientX, e.clientY);
      else animateTo(Math.round(posRef.current + offset));
      settled.current = true;
      return;
    }
    if (Math.abs(d.v) > 0.002) fling(d.v);
    else animateTo(posRef.current, 260);
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

  // the drum's skin: grooves every SKIN_STEP degrees all the way round,
  // turning with the items (only the front half is drawn)
  const SKIN_STEP = 10;
  const skin: number[] = [];
  for (let a = -90; a <= 90; a += SKIN_STEP) skin.push(a);
  const phase = ((pos * STEP) % SKIN_STEP) + SKIN_STEP;

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
      style={{
        height,
        touchAction: "none",
        cursor: "grab",
        perspective: mini ? 320 : 520,
        perspectiveOrigin: "50% 50%",
        // the drum body: a lit cylinder — bright at the front, dark at the rims
        background:
          "linear-gradient(to bottom, #6e6470 0%, #9c92a0 6%, #d9d3d8 18%, #fbf8f6 42%, #ffffff 50%, #fbf8f6 58%, #d9d3d8 82%, #9c92a0 94%, #6e6470 100%)",
      }}
    >
      {/* skin grooves — they rotate with pos, so the cylinder visibly turns */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2" style={{ transformStyle: "preserve-3d", height: 0 }} aria-hidden>
        {skin.map((a) => {
          const theta = a - phase; // degrees from the front
          if (Math.abs(theta) > 88) return null;
          const depth = Math.cos((theta * Math.PI) / 180);
          return (
            <div
              key={a}
              className="absolute inset-x-1"
              style={{
                height: 2,
                top: -1,
                transform: `rotateX(${-theta}deg) translateZ(${RADIUS}px)`,
                background: `rgba(46,36,56,${0.05 + 0.12 * (1 - depth)})`,
                boxShadow: "0 1px 0 rgba(255,255,255,0.55)",
                backfaceVisibility: "hidden",
              }}
            />
          );
        })}
      </div>

      {/* the items on the cylinder */}
      <div className="absolute inset-x-0 top-1/2" style={{ transformStyle: "preserve-3d", height: 0 }}>
        {items.map((it, i) => {
          const theta = (i - pos) * STEP;
          if (Math.abs(theta) > 85) return null;
          const depth = Math.cos((theta * Math.PI) / 180);
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
                transform: `rotateX(${-theta}deg) translateZ(${RADIUS + 2}px)`,
                backfaceVisibility: "hidden",
                opacity: 0.2 + 0.8 * Math.max(0, depth),
                color: centred ? it.tone : "#5a4f63",
                transition: "color 0.2s",
              }}
            >
              <span
                className={`font-display font-extrabold ${mini ? "text-base leading-4" : "text-xl leading-5"}`}
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
              <span className={`line-clamp-1 w-full font-semibold ${mini ? "px-1 text-[9px] leading-3" : "px-2 text-[10px] leading-3"}`} style={{ opacity: 0.55 + 0.45 * depth, textDecoration: it.state === "done" ? "line-through" : "none" }}>
                {it.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* glass window over the front detent + rim shadows on the cylinder ends */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-1.5 top-1/2 z-20 -translate-y-1/2 rounded-lg"
        style={{
          height: ITEM_H + 4,
          border: `2px solid ${accent}77`,
          background: `linear-gradient(to bottom, ${accent}10, ${accent}24 48%, ${accent}0a 52%, ${accent}12)`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px -8px rgba(46,36,56,0.45)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ background: "linear-gradient(to right, rgba(46,36,56,0.22), rgba(46,36,56,0) 12%, rgba(46,36,56,0) 88%, rgba(46,36,56,0.22))" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/4" style={{ background: "linear-gradient(to bottom, rgba(20,14,26,0.35), rgba(20,14,26,0))" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/4" style={{ background: "linear-gradient(to top, rgba(20,14,26,0.35), rgba(20,14,26,0))" }} />
    </div>
  );
}
