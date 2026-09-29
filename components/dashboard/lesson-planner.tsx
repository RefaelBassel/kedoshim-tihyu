"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LessonPlan, PlanBlock, BlockKind, UnitOverview } from "@/lib/lesson-plan";
import Wheel3D, { type WheelItem } from "./wheel-3d";

// מהלך השיעור — built around THE REELS: three slot reels (חזרה · דיון ·
// לימוד), each rolled to a unit. They rest by default on the next unit not
// yet done for that kind. Rolling back lands on "already done" (grey,
// ticked, stamped); rolling ahead on "skipping" (dashed amber, striped).
// "+" beside a reel adds another of its kind; reels drag to reorder with a
// real slide-into-place; ▶ starts the lesson at once. The same builder
// renders full-size on the lesson page and mini in the floating dock on
// every other teacher page.

export const KIND: Record<BlockKind, { emoji: string; label: string; minutes: number; color: string }> = {
  review: { emoji: "🔁", label: "חזרה", minutes: 5, color: "#b96a3b" },
  discussion: { emoji: "💬", label: "דיון", minutes: 15, color: "#413055" },
  study: { emoji: "📖", label: "לימוד", minutes: 20, color: "#3e6b4f" },
};
const DONE_COLOR = "#8a8a80";
const AHEAD_COLOR = "#b3892b";

interface Drum {
  id: string;
  kind: BlockKind;
  taskId: number | null;
}

export function doneFor(u: UnitOverview, kind: BlockKind): boolean {
  if (kind === "review") return u.reviewed > 0;
  if (kind === "discussion") return u.discussed > 0;
  return u.studied > 0 || (u.assigned > 0 && u.complete >= Math.ceil(u.assigned * 0.6));
}
const doneWord: Record<BlockKind, string> = {
  review: "כבר נעשתה עליה חזרה",
  discussion: "כבר נדונה",
  study: "כבר נלמדה",
};
const unitNum = (u: UnitOverview, i: number) => u.position?.match(/משימה (\d+)/)?.[1] ?? String(i + 1);

// ---------------------------------------------------------------------------
// Data hook shared by the page and the dock
// ---------------------------------------------------------------------------
export function useLessonPlan() {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [units, setUnits] = useState<UnitOverview[]>([]);
  const [busy, setBusy] = useState(false);
  const apply = (d: { ok?: boolean; plan?: LessonPlan; units?: UnitOverview[] }) => {
    if (!d.ok) return;
    if (d.plan) setPlan(d.plan);
    if (d.units) setUnits(d.units);
    window.dispatchEvent(new Event("lesson-plan-changed"));
  };
  const load = useCallback(
    () => fetch("/api/lesson-plan", { cache: "no-store" }).then((r) => r.json()).then(apply).catch(() => {}),
    []
  );
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    const onChanged = () => {
      // another instance (page ↔ dock) changed the plan
      fetch("/api/lesson-plan", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) {
            if (d.plan) setPlan(d.plan);
            if (d.units) setUnits(d.units);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("lesson-plan-changed", onChanged);
    return () => {
      clearInterval(iv);
      window.removeEventListener("lesson-plan-changed", onChanged);
    };
  }, [load]);
  const act = async (action: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/lesson-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      apply(await r.json());
    } finally {
      setBusy(false);
    }
  };
  const persist = async (blocks: PlanBlock[]) => {
    const r = await fetch("/api/lesson-plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    apply(await r.json());
  };
  // the teacher's own marks: tick / untick a circle, or "everything up to here"
  const markUnit = async (taskId: number, kind: BlockKind, on: boolean): Promise<UnitOverview[]> => {
    const r = await fetch("/api/lesson-plan/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", taskId, kind, on }),
    });
    const d = await r.json();
    apply(d);
    return d.units ?? [];
  };
  const markUpTo = async (taskId: number) => {
    const r = await fetch("/api/lesson-plan/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "up-to", taskId }),
    });
    apply(await r.json());
  };
  return { plan, units, busy, setBusy, act, persist, markUnit, markUpTo };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
export default function LessonPlanner() {
  const { plan, units, busy, setBusy, act, persist, markUnit, markUpTo } = useLessonPlan();
  const [popover, setPopover] = useState<{ ref: string; x: number; y: number } | null>(null);
  const published = useMemo(() => units.filter((u) => u.taskId != null), [units]);
  // the popover shows the LIVE unit, so a tick inside it is visible at once
  const popUnit = popover ? units.find((u) => u.ref === popover.ref) ?? null : null;
  if (!plan) return <p className="p-6 text-center text-sm text-[color:var(--primary)]/60">טוען…</p>;
  const running = plan.current >= 0 && plan.blocks.length > 0;
  return (
    <div className="space-y-8" dir="rtl" onClick={() => setPopover(null)}>
      {running ? (
        <RunningBar plan={plan} busy={busy} act={act} />
      ) : (
        <WheelBuilder
          units={published}
          savedBlocks={plan.blocks}
          busy={busy}
          onStart={async (blocks) => {
            setBusy(true);
            try {
              await persist(blocks);
              await act("start");
            } finally {
              setBusy(false);
            }
          }}
          onPersist={persist}
          onShowUnit={(unit, x, y) => setPopover({ ref: unit.ref, x, y })}
        />
      )}
      <Journey units={units} onShowUnit={(unit, x, y) => setPopover({ ref: unit.ref, x, y })} onMark={markUnit} />
      {popover && popUnit && (
        <UnitPopover unit={popUnit} x={popover.x} y={popover.y} onClose={() => setPopover(null)} onMark={markUnit} onMarkUpTo={markUpTo} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The reels
// ---------------------------------------------------------------------------
export function WheelBuilder({
  units,
  savedBlocks,
  busy,
  onStart,
  onPersist,
  onShowUnit,
  mini = false,
}: {
  units: UnitOverview[];
  savedBlocks: PlanBlock[];
  busy: boolean;
  onStart: (blocks: PlanBlock[]) => Promise<void>;
  onPersist: (blocks: PlanBlock[]) => Promise<void>;
  onShowUnit?: (u: UnitOverview, x: number, y: number) => void;
  mini?: boolean;
}) {
  const defaultFor = useCallback(
    (kind: BlockKind): number | null => {
      const u = units.find((x) => !doneFor(x, kind)) ?? units[units.length - 1];
      return u?.taskId ?? null;
    },
    [units]
  );
  const [drums, setDrums] = useState<Drum[] | null>(null);
  useEffect(() => {
    if (drums != null || units.length === 0) return;
    if (savedBlocks.length > 0) setDrums(savedBlocks.map((b, i) => ({ id: `d${i}-${b.kind}`, kind: b.kind, taskId: b.taskId })));
    else setDrums((["review", "discussion", "study"] as BlockKind[]).map((kind, i) => ({ id: `d${i}-${kind}`, kind, taskId: defaultFor(kind) })));
  }, [units, savedBlocks, drums, defaultFor]);
  // a reel the teacher never rolled sits on the default; when she ticks a
  // unit as done the default moves on — and so does that reel
  const prevDefaults = useRef<Record<BlockKind, number | null> | null>(null);
  useEffect(() => {
    const cur: Record<BlockKind, number | null> = { review: defaultFor("review"), discussion: defaultFor("discussion"), study: defaultFor("study") };
    const prev = prevDefaults.current;
    prevDefaults.current = cur;
    if (!prev || !drums) return;
    const moved = (["review", "discussion", "study"] as BlockKind[]).filter((k) => prev[k] !== cur[k]);
    if (moved.length === 0) return;
    setDrums((ds) => {
      if (!ds) return ds;
      let changed = false;
      const next = ds.map((d) => {
        if (moved.includes(d.kind) && d.taskId === prev[d.kind]) {
          changed = true;
          return { ...d, taskId: cur[d.kind] };
        }
        return d;
      });
      if (changed) {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => void onPersist(toBlocks(next)), 600);
      }
      return changed ? next : ds;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFor]);

  const saveTimer = useRef<number | null>(null);
  const toBlocks = (ds: Drum[]): PlanBlock[] =>
    ds.filter((d) => d.taskId != null).map((d) => ({ kind: d.kind, taskId: d.taskId as number, title: units.find((u) => u.taskId === d.taskId)?.title ?? "" }));
  const update = (next: Drum[]) => {
    setDrums(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void onPersist(toBlocks(next)), 600);
  };

  // ---- drag a reel to reorder: the dragged reel follows the pointer 1:1
  // and lifts; the others slide into their new slots as it crosses them;
  // on release it glides into its slot, and only then the order commits ----
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; over: number; settling: boolean } | null>(null);
  // the reels always fit the row: more reels → narrower reels, never a
  // hidden fourth reel off the edge of a phone
  const [rowW, setRowW] = useState(0);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setRowW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
    // the row only exists once the plan has loaded — observe it then
  }, [drums != null]);
  const dragStart = useRef<{ x: number; id: string; index: number; centers: number[]; gap: number; over: number } | null>(null);
  const settleTimer = useRef<number | null>(null);
  const drumsRef = useRef<Drum[] | null>(null);
  drumsRef.current = drums;
  const measure = () => {
    const kids = rowRef.current ? [...rowRef.current.querySelectorAll<HTMLElement>("[data-drum]")] : [];
    const rects = kids.map((k) => k.getBoundingClientRect());
    const gap = rects.length > 1 ? Math.abs(rects[1].left - rects[0].left) : 170;
    return { centers: rects.map((r) => r.left + r.width / 2), gap };
  };
  const onGripDown = (e: React.PointerEvent, id: string) => {
    if (!drums) return;
    // a previous reorder still gliding home: land it now, then start fresh
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      setDrag(null);
    }
    const { centers, gap } = measure();
    const index = drums.findIndex((d) => d.id === id);
    dragStart.current = { x: e.clientX, id, index, centers, gap, over: index };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    setDrag({ id, dx: 0, over: index, settling: false });
  };
  const onGripMove = (e: React.PointerEvent) => {
    const s = dragStart.current;
    if (!s || !drums) return;
    // the dragged reel follows the finger 1:1, clamped to the row
    const n = s.centers.length;
    const minDx = s.centers[n - 1] - s.centers[s.index] - s.gap * 0.35; // leftmost slot (RTL: last index)
    const maxDx = s.centers[0] - s.centers[s.index] + s.gap * 0.35; // rightmost slot (index 0)
    const dx = Math.max(Math.min(minDx, maxDx), Math.min(Math.max(minDx, maxDx), e.clientX - s.x));
    // slot = how many slots the reel has travelled; RTL: leftwards = later index
    const travelled = -dx / s.gap;
    const over = Math.max(0, Math.min(n - 1, Math.round(s.index + travelled)));
    if (over !== s.over) {
      s.over = over;
      try {
        navigator.vibrate?.(6);
      } catch {
        /* no haptics */
      }
    }
    setDrag({ id: s.id, dx, over, settling: false });
  };
  const onGripUp = () => {
    const s = dragStart.current;
    if (!s || !drums) return;
    const over = s.over;
    dragStart.current = null;
    if (over === s.index) {
      // glide back home
      setDrag({ id: s.id, dx: 0, over, settling: true });
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        setDrag(null);
      }, 260);
      return;
    }
    // glide to the destination slot, then commit the order
    const toDx = s.centers[over] - s.centers[s.index];
    setDrag({ id: s.id, dx: toDx, over, settling: true });
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      const cur = drumsRef.current ?? [];
      const fromNow = cur.findIndex((d) => d.id === s.id);
      if (fromNow < 0) {
        setDrag(null);
        return;
      }
      const next = [...cur];
      const [moved] = next.splice(fromNow, 1);
      next.splice(Math.min(over, next.length), 0, moved);
      setDrag(null);
      update(next);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* no haptics */
      }
    }, 260);
  };

  if (!drums) return null;
  const total = drums.reduce((n, d) => n + KIND[d.kind].minutes, 0);
  const ready = drums.length > 0 && drums.every((d) => d.taskId != null);
  const gapPx = mini ? 10 : 14;
  const maxW = mini ? 118 : 156;
  const drumW = rowW > 0 ? Math.max(64, Math.min(maxW, Math.floor((rowW - gapPx * (drums.length - 1)) / drums.length))) : maxW;
  const compact = drumW < 96;
  const from = drag ? drums.findIndex((x) => x.id === drag.id) : -1;
  const gapNow = dragStart.current?.gap ?? 170;
  // how far (in slots, signed: + = towards later index = leftwards in RTL)
  // the dragged reel has travelled right now
  const travelled = drag ? -drag.dx / gapNow : 0;
  const slotShift = (i: number) => {
    if (!drag || i === from) return 0;
    if (drag.settling) {
      // glide phase: everyone sits exactly in its final slot
      if (from < drag.over && i > from && i <= drag.over) return gapNow;
      if (from > drag.over && i >= drag.over && i < from) return -gapNow;
      return 0;
    }
    // live phase: a neighbour slides the other way in step with the dragged
    // reel crossing it — the swap is visible from the first millimetre
    const d = i - from; // slots between the neighbour and the dragged reel's home
    if (d > 0 && travelled > d - 1) return gapNow * Math.min(1, travelled - (d - 1));
    if (d < 0 && travelled < d + 1) return -gapNow * Math.min(1, (d + 1) - travelled);
    return 0;
  };

  return (
    <section className={mini ? "" : "rounded-3xl border-2 border-[color:var(--accent)]/50 bg-[color:var(--card)] p-3 shadow-sm sm:p-5"}>
      {!mini && (
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">🎰 השיעור של היום</p>
          <span className="rounded-full bg-[color:var(--background)] px-3 py-1 text-xs font-bold text-[color:var(--primary)]/70">~{total} דק׳</span>
        </div>
      )}

      <div ref={rowRef} className={`flex ${mini ? "pb-1 pt-1" : "pb-3 pt-2"}`} style={{ gap: gapPx }}>
        {drums.map((d, i) => {
          const isDragged = drag?.id === d.id;
          const shift = slotShift(i);
          const lift = isDragged && !drag!.settling;
          return (
            <DrumView
              key={d.id}
              drum={d}
              units={units}
              defaultTaskId={defaultFor(d.kind)}
              mini={mini}
              width={drumW}
              compact={compact}
              style={{
                transform: isDragged
                  ? `translateX(${drag!.dx}px) ${lift ? `scale(1.06) rotate(${Math.max(-5, Math.min(5, -drag!.dx / 50))}deg)` : "scale(1)"}`
                  : shift
                    ? `translateX(${shift}px)`
                    : undefined,
                transition:
                  drag && !drag.settling
                    ? "box-shadow 0.2s"
                    : "transform 0.26s cubic-bezier(0.34, 1.3, 0.64, 1), box-shadow 0.2s, filter 0.35s, border-color 0.35s",
                zIndex: isDragged ? 30 : undefined,
              }}
              dragging={lift}
              canRemove={drums.length > 1}
              onGripDown={(e) => onGripDown(e, d.id)}
              onGripMove={onGripMove}
              onGripUp={onGripUp}
              onSelect={(taskId) => update(drums.map((x) => (x.id === d.id ? { ...x, taskId } : x)))}
              onAddSame={() => {
                const idx = units.findIndex((u) => u.taskId === d.taskId);
                const nextUnit = units[Math.min(units.length - 1, Math.max(0, idx + 1))];
                const fresh: Drum = { id: `d${Date.now().toString(36)}-${d.kind}`, kind: d.kind, taskId: nextUnit?.taskId ?? d.taskId };
                const next = [...drums];
                next.splice(i + 1, 0, fresh);
                update(next);
              }}
              onRemove={() => update(drums.filter((x) => x.id !== d.id))}
              onShowUnit={onShowUnit}
            />
          );
        })}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-2 ${mini ? "mt-1.5 px-1" : "mt-2 px-1"}`}>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => onStart(toBlocks(drums))}
          className={`rounded-full bg-[color:var(--accent)] font-extrabold text-white shadow-lg transition hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 ${mini ? "px-5 py-2 text-sm" : "px-7 py-3 text-base"}`}
        >
          ▶ להתחיל את השיעור
        </button>
        <span className={`text-[color:var(--primary)]/50 ${mini ? "text-[10px]" : "text-[11px]"}`}>~{total} דק׳ · מעלה-מטה מגלגל · לצדדים מסדר · ＋ עוד גלגל</span>
      </div>
    </section>
  );
}

function DrumView({
  drum,
  units,
  defaultTaskId,
  style,
  dragging,
  canRemove,
  mini,
  width,
  compact,
  onGripDown,
  onGripMove,
  onGripUp,
  onSelect,
  onAddSame,
  onRemove,
  onShowUnit,
}: {
  drum: Drum;
  units: UnitOverview[];
  defaultTaskId: number | null;
  style?: React.CSSProperties;
  dragging: boolean;
  canRemove: boolean;
  mini: boolean;
  width: number;
  compact: boolean;
  onGripDown: (e: React.PointerEvent) => void;
  onGripMove: (e: React.PointerEvent) => void;
  onGripUp: () => void;
  onSelect: (taskId: number) => void;
  onAddSame: () => void;
  onRemove: () => void;
  onShowUnit?: (u: UnitOverview, x: number, y: number) => void;
}) {
  const k = KIND[drum.kind];
  const defaultIdx = units.findIndex((u) => u.taskId === defaultTaskId);
  const index = Math.max(0, units.findIndex((u) => u.taskId === drum.taskId));
  const selected = units[index];
  const selectedDone = selected ? doneFor(selected, drum.kind) : false;
  const selectedAhead = defaultIdx >= 0 && index > defaultIdx;
  const state: "done" | "ahead" | "next" = selectedDone ? "done" : selectedAhead ? "ahead" : "next";
  const tone = state === "done" ? DONE_COLOR : state === "ahead" ? AHEAD_COLOR : k.color;

  const items: WheelItem[] = units.map((u, i) => {
    const done = doneFor(u, drum.kind);
    const ahead = defaultIdx >= 0 && i > defaultIdx;
    return { key: `${drum.id}-${u.ref}`, num: unitNum(u, i), label: shortTitle(u.title), tone: done ? DONE_COLOR : ahead ? AHEAD_COLOR : k.color, done, state: done ? "done" : ahead ? "ahead" : "next" };
  });

  return (
    <div
      data-drum
      className={`drum drum-in relative min-w-0 shrink-0 rounded-2xl border-2 bg-[color:var(--card)] ${dragging ? "dragging" : ""}`}
      style={{ ...style, width, borderColor: tone, borderStyle: state === "ahead" ? "dashed" : "solid", filter: state === "done" ? "saturate(0.3)" : undefined }}
    >
      <div
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        className={`flex cursor-grab select-none items-center justify-between rounded-t-2xl text-white active:cursor-grabbing ${compact ? "gap-0.5 px-1.5 py-1" : mini ? "px-2 py-1" : "px-2.5 py-2"}`}
        style={{ background: tone, touchAction: "none", transition: "background 0.3s" }}
        title="גררי כדי לשנות סדר"
      >
        <span className={`truncate font-extrabold ${compact ? "text-[10px]" : mini ? "text-xs" : "text-sm"}`}>
          {/* compact reels leave the ✓ / ⏭ to the ribbon — the word must fit */}
          {compact ? "" : state === "done" ? "✓ " : state === "ahead" ? "⏭ " : ""}
          {k.emoji} {k.label}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {!compact && <span aria-hidden className="text-[10px] tracking-[0.15em] opacity-70">⋮⋮</span>}
          {canRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="להסיר גלגל"
              className={`flex shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/35 ${compact ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[11px]"}`}
            >
              ✕
            </button>
          )}
        </span>
      </div>

      <div className="relative">
        {state !== "next" && (
          <span
            aria-hidden
            className={`warn-in pointer-events-none absolute z-30 rotate-45 font-extrabold text-white shadow ${mini ? "-end-5 top-3 px-6 text-[8px]" : "-end-6 top-5 px-8 py-0.5 text-[10px]"}`}
            style={{ background: state === "done" ? DONE_COLOR : AHEAD_COLOR }}
          >
            {state === "done" ? "נעשה ✓" : "⏭ דילוג"}
          </span>
        )}
        {state === "ahead" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[15] opacity-40" style={{ background: "repeating-linear-gradient(135deg, transparent 0 10px, #b3892b55 10px 20px)" }} />
        )}
        <Wheel3D
          items={items}
          index={index}
          accent={tone}
          mini={mini}
          compact={compact}
          itemHeight={mini ? 40 : 46}
          height={mini ? 160 : 230}
          onReorderStart={onGripDown}
          onReorderMove={onGripMove}
          onReorderEnd={onGripUp}
          onChange={(i) => {
            const u = units[i];
            if (u?.taskId != null && u.taskId !== drum.taskId) onSelect(u.taskId);
          }}
          onTapCentre={(i, x, y) => onShowUnit?.(units[i], x, y)}
        />
      </div>

      <div className={`text-center ${mini ? "min-h-[26px] px-1 pb-1 pt-0.5" : "min-h-[34px] px-2 pb-2 pt-1"}`}>
        {state === "done" ? (
          <p key="done" className={`warn-in rounded-lg px-1 py-0.5 font-bold leading-4 ${mini ? "text-[9px]" : "text-[10px]"}`} style={{ background: `${DONE_COLOR}22`, color: "#5c5c52" }}>
            {doneWord[drum.kind]} · שוב?
          </p>
        ) : state === "ahead" ? (
          <p key="ahead" className={`warn-in rounded-lg px-1 py-0.5 font-bold leading-4 ${mini ? "text-[9px]" : "text-[10px]"}`} style={{ background: `${AHEAD_COLOR}22`, color: "#7a5b12" }}>
            מדלגים קדימה
          </p>
        ) : (
          <p key="next" className={`font-semibold leading-4 ${mini ? "text-[9px]" : "text-[10px]"}`} style={{ color: k.color }}>הבאה בתור ✓</p>
        )}
      </div>

      <button
        type="button"
        onClick={onAddSame}
        aria-label={`עוד ${k.label}`}
        title={`עוד ${k.label}`}
        className={`absolute top-[46%] z-20 flex items-center justify-center rounded-full border-2 bg-[color:var(--card)] font-extrabold shadow-md transition hover:scale-110 active:scale-90 ${mini ? "-end-3 h-6 w-6 text-sm" : "-end-3.5 h-8 w-8 text-base"}`}
        style={{ borderColor: k.color, color: k.color }}
      >
        ＋
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Running bar
// ---------------------------------------------------------------------------
export function RunningBar({ plan, busy, act, mini = false }: { plan: LessonPlan; busy: boolean; act: (a: string) => Promise<void>; mini?: boolean }) {
  return (
    <section className={mini ? "" : "rounded-3xl border-2 border-[color:var(--accent)] bg-[color:var(--card)] p-4 sm:p-5"}>
      {!mini && <p className="mb-3 font-display text-xl font-extrabold text-[color:var(--primary)]">▶ השיעור רץ</p>}
      <ol className="flex flex-wrap items-center gap-2">
        {plan.blocks.map((b, i) => {
          const k = KIND[b.kind];
          const isNow = plan.current === i;
          const done = plan.current > i;
          return (
            <li
              key={`${b.kind}-${b.taskId}-${i}`}
              className={`flex items-center gap-2 rounded-full border-2 font-bold transition ${mini ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${done ? "opacity-45 line-through" : ""} ${isNow ? "scale-105 shadow-md" : ""}`}
              style={{ borderColor: k.color, background: isNow ? k.color : `${k.color}14`, color: isNow ? "#fff" : k.color }}
              title={b.title}
            >
              {i + 1}. {k.emoji} {k.label}
              {!mini && <span className={`max-w-[140px] truncate text-xs font-semibold ${isNow ? "text-white/85" : "opacity-70"}`}>{shortTitle(b.title)}</span>}
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || plan.current === 0} onClick={() => act("prev")} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)] active:scale-95 disabled:opacity-40">→ הקודם</button>
        {plan.current < plan.blocks.length - 1 ? (
          <button type="button" disabled={busy} onClick={() => act("next")} className="rounded-full bg-[color:var(--accent)] px-4 py-1 text-sm font-bold text-white shadow active:scale-95 disabled:opacity-40">הבא ←</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => act("stop")} className="rounded-full bg-[color:var(--success)] px-4 py-1 text-sm font-bold text-white shadow active:scale-95 disabled:opacity-40">✓ סיום השיעור</button>
        )}
        <button type="button" disabled={busy} onClick={() => act("cancel")} className="ms-auto text-[10px] font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--danger)]">לעצור ולתכנן מחדש</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The journey
// ---------------------------------------------------------------------------
function Journey({
  units,
  onShowUnit,
  onMark,
}: {
  units: UnitOverview[];
  onShowUnit: (u: UnitOverview, x: number, y: number) => void;
  onMark: (taskId: number, kind: BlockKind, on: boolean) => Promise<UnitOverview[]>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = async (u: UnitOverview, kind: BlockKind, on: boolean) => {
    if (u.taskId == null) return;
    const next = await onMark(u.taskId, kind, on);
    const fresh = next.find((x) => x.ref === u.ref);
    if (!on && fresh && doneFor(fresh, kind)) {
      // the data itself says so — a closed debate, most of the class finished
      setNotice(kind === "discussion" ? "הדיון הזה באמת התקיים באתר (לוח שנסגר) — אי אפשר לבטל." : "רוב הכיתה כבר סיימה את היחידה באתר — היא נחשבת נלמדה.");
      window.setTimeout(() => setNotice(null), 3600);
    }
  };
  return (
    <section className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">🗺️ המסע</p>
        <p className="text-end text-[10px] leading-4 text-[color:var(--primary)]/50">לחיצה על יחידה — פרטים וכלים · לחיצה על עיגול — סימון ״כבר נעשה״ (ושוב — ביטול)</p>
      </div>
      {notice && (
        <div className="note-pop pointer-events-none fixed inset-x-0 bottom-24 z-[96] flex justify-center px-4">
          <p className="rounded-full bg-[color:var(--ink,#2e2438)] px-4 py-2 text-xs font-bold text-white shadow-xl">{notice}</p>
        </div>
      )}
      <ol className="space-y-2">
        {units.map((u, i) => {
          const published = u.taskId != null;
          const pct = u.assigned ? Math.round((100 * u.complete) / u.assigned) : 0;
          return (
            <li key={u.ref}>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onShowUnit(u, e.clientX, e.clientY); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); onShowUnit(u, r.left + r.width / 2, r.top); } }}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-[color:var(--card)] p-3 text-start transition hover:border-[color:var(--accent)] active:scale-[0.995] ${published ? "border-[color:var(--border)]" : "border-dashed border-[color:var(--border)] opacity-60"}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)]/8 font-display text-base font-extrabold text-[color:var(--primary)]">{unitNum(u, i)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[color:var(--primary)]">{u.title}</span>
                  <span className="block text-[11px] text-[color:var(--primary)]/55">{published ? `${u.complete}/${u.assigned} סיימו (${pct}%)` : "עוד לא פורסמה"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {(["review", "discussion", "study"] as BlockKind[]).map((kind) => (
                    <DoneDot key={kind} kind={kind} on={published && doneFor(u, kind)} disabled={!published} onToggle={(on) => toggle(u, kind, on)} />
                  ))}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// One circle = one kind on one unit. Tap: fills with the kind's colour and
// a tick, saved at once; tap again: empties. While saving it breathes.
function DoneDot({ kind, on, disabled, onToggle, size = "md" }: { kind: BlockKind; on: boolean; disabled?: boolean; onToggle: (on: boolean) => Promise<void>; size?: "md" | "lg" }) {
  const [pending, setPending] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [shown, setShown] = useState(on);
  useEffect(() => setShown(on), [on]);
  const k = KIND[kind];
  const click = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || pending) return;
    const want = !shown;
    setShown(want);
    setPulse((n) => n + 1);
    setPending(true);
    try {
      await onToggle(want);
    } catch {
      setShown(on);
    } finally {
      setPending(false);
    }
  };
  const dim = size === "lg" ? "h-10 min-w-10 px-2 text-sm" : "h-8 w-8 text-sm";
  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled}
      aria-pressed={shown}
      aria-label={`${k.label}: ${shown ? "נעשה — לחיצה מבטלת" : "עוד לא — לחיצה מסמנת"}`}
      title={`${k.label}: ${shown ? "נעשה ✓ (לחיצה מבטלת)" : "עוד לא (לחיצה מסמנת)"}`}
      className={`relative flex items-center justify-center gap-1 rounded-full font-bold transition-all duration-300 active:scale-90 disabled:cursor-default ${dim} ${pulse ? "tap-pulse" : ""} ${pending ? "animate-pulse" : ""}`}
      key={pulse}
      style={{
        background: shown ? k.color : "var(--background)",
        color: shown ? "#fff" : "var(--primary)",
        border: `2px solid ${shown ? k.color : "var(--border)"}`,
        opacity: disabled ? 0.25 : shown ? 1 : 0.55,
        filter: shown || disabled ? "none" : "grayscale(1)",
        boxShadow: shown ? `0 6px 16px -8px ${k.color}` : "none",
      }}
    >
      <span aria-hidden>{k.emoji}</span>
      {size === "lg" && <span>{k.label}</span>}
      {shown && <span aria-hidden className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-extrabold shadow" style={{ color: k.color }}>✓</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Unit popover — details + tools, no page change
// ---------------------------------------------------------------------------
export function UnitPopover({
  unit,
  x,
  y,
  onClose,
  onMark,
  onMarkUpTo,
}: {
  unit: UnitOverview;
  x: number;
  y: number;
  onClose: () => void;
  onMark?: (taskId: number, kind: BlockKind, on: boolean) => Promise<UnitOverview[]>;
  onMarkUpTo?: (taskId: number) => Promise<void>;
}) {
  const [upTo, setUpTo] = useState<"idle" | "working" | "done">("idle");
  const w = Math.min(340, typeof window !== "undefined" ? window.innerWidth - 24 : 340);
  const left = typeof window !== "undefined" ? Math.max(12, Math.min(x - w / 2, window.innerWidth - w - 12)) : 12;
  const top = typeof window !== "undefined" ? Math.max(12, Math.min(y - 300, window.innerHeight - 320)) : y;
  const pct = unit.assigned ? Math.round((100 * unit.complete) / unit.assigned) : 0;
  return (
    <div className="note-pop fixed z-[95] rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 shadow-2xl" style={{ left, top, width: w }} dir="rtl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-display text-base font-extrabold leading-snug text-[color:var(--primary)]">{unit.title}</p>
        <button type="button" onClick={onClose} aria-label="סגירה" className="shrink-0 text-xs text-[color:var(--primary)]/50">✕</button>
      </div>
      <p className="text-[11px] text-[color:var(--primary)]/55">{unit.position}{unit.subtitle ? ` · ${unit.subtitle}` : ""}</p>
      {unit.taskId != null ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            {onMark ? (
              (["review", "discussion", "study"] as BlockKind[]).map((kind) => (
                <DoneDot key={kind} kind={kind} size="lg" on={doneFor(unit, kind)} onToggle={async (on) => { await onMark(unit.taskId!, kind, on); }} />
              ))
            ) : (
              <>
                <Chip on={doneFor(unit, "review")} label={`🔁 חזרה${unit.reviewed ? ` ×${unit.reviewed}` : ""}`} color={KIND.review.color} />
                <Chip on={doneFor(unit, "discussion")} label={`💬 דיון${unit.discussed ? ` ×${unit.discussed}` : ""}`} color={KIND.discussion.color} />
                <Chip on={doneFor(unit, "study")} label={`📖 לימוד · ${pct}% סיימו`} color={KIND.study.color} />
              </>
            )}
            <span className="text-[10px] font-semibold text-[color:var(--primary)]/50">{pct}% מהכיתה סיימו</span>
          </div>
          {onMarkUpTo && (
            <button
              type="button"
              disabled={upTo !== "idle"}
              onClick={async () => {
                setUpTo("working");
                try {
                  await onMarkUpTo(unit.taskId!);
                  setUpTo("done");
                  window.setTimeout(() => setUpTo("idle"), 1800);
                } catch {
                  setUpTo("idle");
                }
              }}
              className={`mt-2 w-full rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold transition-all duration-300 active:scale-[0.98] ${upTo === "done" ? "border-[color:var(--success)] bg-[color:var(--success)] text-white" : upTo === "working" ? "animate-pulse border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]" : "border-dashed border-[color:var(--primary)]/35 text-[color:var(--primary)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"}`}
              title="מסמן חזרה, דיון ולימוד לכל היחידות מתחילת המסע ועד היחידה הזו"
            >
              {upTo === "done" ? "נשמר ✓ — עד כאן הכול נעשה" : upTo === "working" ? "מסמנים…" : "✓ הכול עד כאן כבר נלמד (חזרה, דיון, לימוד)"}
            </button>
          )}
          {unit.question && <p className="mt-2 rounded-lg bg-[color:var(--background)] px-3 py-2 text-xs leading-5 text-[color:var(--foreground)]/80">💬 {unit.question}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <a href={`/dashboard/review/${unit.taskId}`} target="_blank" rel="noopener noreferrer" className="rounded-full px-3 py-1 text-white" style={{ background: KIND.review.color }}>🔁 מצגת ↗</a>
            <a href={`/dashboard/discussion/${unit.taskId}/control`} className="rounded-full px-3 py-1 text-white" style={{ background: KIND.discussion.color }}>🎛️ בקרת דיון</a>
            <a href={`/dashboard/discussion/${unit.taskId}/board`} target="_blank" rel="noopener noreferrer" className="rounded-full border px-3 py-1" style={{ borderColor: KIND.discussion.color, color: KIND.discussion.color }}>🖥️ לוח ↗</a>
            <a href={`/tasks/${unit.taskId}`} className="rounded-full px-3 py-1 text-white" style={{ background: KIND.study.color }}>📖 המשימה</a>
            <a href={`/dashboard/content/${unit.ref}`} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[color:var(--primary)]">✏️ תוכן</a>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-[color:var(--warning)]">היחידה עוד לא פורסמה — מפרסמים בדשבורד, ואז היא נכנסת לגלגלים.</p>
      )}
    </div>
  );
}

function Chip({ on, label, color }: { on: boolean; label: string; color: string }) {
  return (
    <span className="rounded-full px-2.5 py-0.5" style={{ background: on ? `${color}22` : "var(--background)", color: on ? color : "var(--primary)", opacity: on ? 1 : 0.5, border: `1px solid ${on ? color : "var(--border)"}` }}>
      {on ? "✓ " : ""}{label}
    </span>
  );
}

function shortTitle(t: string) {
  const s = t.replace(/^[״"]|[״"]$/g, "");
  return s.length > 22 ? s.slice(0, 20) + "…" : s;
}
