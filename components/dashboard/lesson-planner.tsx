"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LessonPlan, PlanBlock, BlockKind, UnitOverview } from "@/lib/lesson-plan";

// מהלך השיעור — one screen, built around THE WHEELS: three slot drums
// (חזרה · דיון · לימוד), each spun to a unit. They rest by default on the
// next unit not yet done for that kind (after review 1, debate 1, study 2
// → review 2, debate 2, study 3). Spinning back lands on "already done"
// colours (with a gentle "again?" note); spinning ahead lands on "skipping
// ahead" colours. "+" beside a drum adds another of its kind; drums are
// dragged to reorder; ▶ starts the lesson at once. Below: the journey —
// every unit with its three done-marks; tapping a unit opens a popover
// (never a new page). Once started, the wheels give way to the running
// strip's twin here.

const KIND: Record<BlockKind, { emoji: string; label: string; minutes: number; color: string; soft: string }> = {
  review: { emoji: "🔁", label: "חזרה", minutes: 5, color: "#b96a3b", soft: "#f3dccb" },
  discussion: { emoji: "💬", label: "דיון", minutes: 15, color: "#413055", soft: "#ded3ea" },
  study: { emoji: "📖", label: "לימוד", minutes: 20, color: "#3e6b4f", soft: "#d3e5d8" },
};
const DONE_COLOR = "#8a8a80";
const AHEAD_COLOR = "#b3892b";

interface Drum {
  id: string;
  kind: BlockKind;
  taskId: number | null;
}

function doneFor(u: UnitOverview, kind: BlockKind): boolean {
  if (kind === "review") return u.reviewed > 0;
  if (kind === "discussion") return u.discussed > 0;
  return u.studied > 0 || (u.assigned > 0 && u.complete >= Math.ceil(u.assigned * 0.6));
}
const doneWord: Record<BlockKind, string> = {
  review: "כבר נעשתה עליה חזרה",
  discussion: "כבר נדונה",
  study: "כבר נלמדה",
};

export default function LessonPlanner() {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [units, setUnits] = useState<UnitOverview[]>([]);
  const [busy, setBusy] = useState(false);
  const [popover, setPopover] = useState<{ unit: UnitOverview; x: number; y: number } | null>(null);

  const apply = (d: { ok?: boolean; plan?: LessonPlan; units?: UnitOverview[] }) => {
    if (!d.ok) return;
    if (d.plan) setPlan(d.plan);
    if (d.units) setUnits(d.units);
    // the strip at the top of the page follows immediately, not on its next poll
    window.dispatchEvent(new Event("lesson-plan-changed"));
  };
  const load = useCallback(
    () => fetch("/api/lesson-plan", { cache: "no-store" }).then((r) => r.json()).then(apply).catch(() => {}),
    []
  );
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
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

  const published = useMemo(() => units.filter((u) => u.taskId != null), [units]);

  if (!plan) {
    return <p className="p-6 text-center text-sm text-[color:var(--primary)]/60">טוען את מהלך השיעור...</p>;
  }
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
          onShowUnit={(unit, x, y) => setPopover({ unit, x, y })}
        />
      )}

      <Journey units={units} onShowUnit={(unit, x, y) => setPopover({ unit, x, y })} />

      {popover && <UnitPopover unit={popover.unit} x={popover.x} y={popover.y} onClose={() => setPopover(null)} />}
    </div>
  );
}

// =============================================================================
// The wheels
// =============================================================================

function WheelBuilder({
  units,
  savedBlocks,
  busy,
  onStart,
  onPersist,
  onShowUnit,
}: {
  units: UnitOverview[];
  savedBlocks: PlanBlock[];
  busy: boolean;
  onStart: (blocks: PlanBlock[]) => Promise<void>;
  onPersist: (blocks: PlanBlock[]) => Promise<void>;
  onShowUnit: (u: UnitOverview, x: number, y: number) => void;
}) {
  // the resting position of each kind: the first unit not yet done for it
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
    if (savedBlocks.length > 0) {
      setDrums(savedBlocks.map((b, i) => ({ id: `d${i}-${b.kind}`, kind: b.kind, taskId: b.taskId })));
    } else {
      setDrums(
        (["review", "discussion", "study"] as BlockKind[]).map((kind, i) => ({
          id: `d${i}-${kind}`,
          kind,
          taskId: defaultFor(kind),
        }))
      );
    }
  }, [units, savedBlocks, drums, defaultFor]);

  // persist quietly whenever the drums settle
  const saveTimer = useRef<number | null>(null);
  const scheduleSave = (next: Drum[]) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const blocks: PlanBlock[] = next
        .filter((d) => d.taskId != null)
        .map((d) => ({ kind: d.kind, taskId: d.taskId as number, title: units.find((u) => u.taskId === d.taskId)?.title ?? "" }));
      void onPersist(blocks);
    }, 600);
  };
  const update = (next: Drum[]) => {
    setDrums(next);
    scheduleSave(next);
  };

  // ---- drag to reorder drums (pointer based, works with touch) ----
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; over: number } | null>(null);
  const dragStart = useRef<{ x: number; id: string; index: number; widths: number[] } | null>(null);
  const onGripDown = (e: React.PointerEvent, id: string) => {
    if (!drums) return;
    const row = rowRef.current;
    if (!row) return;
    const kids = [...row.querySelectorAll<HTMLElement>("[data-drum]")];
    dragStart.current = { x: e.clientX, id, index: drums.findIndex((d) => d.id === id), widths: kids.map((k) => k.getBoundingClientRect().width + 12) };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // capture is best-effort (synthetic pointers have no active id)
    }
    setDrag({ id, dx: 0, over: dragStart.current.index });
  };
  const onGripMove = (e: React.PointerEvent) => {
    const s = dragStart.current;
    if (!s || !drums) return;
    // RTL: moving the pointer left means moving to a LATER index
    const dx = e.clientX - s.x;
    let over = s.index;
    let acc = 0;
    const step = s.widths[s.index] || 1;
    if (dx < 0) {
      while (over < drums.length - 1 && -dx > acc + step / 2) {
        acc += s.widths[over + 1] || step;
        over += 1;
      }
    } else {
      while (over > 0 && dx > acc + step / 2) {
        acc += s.widths[over - 1] || step;
        over -= 1;
      }
    }
    setDrag({ id: s.id, dx, over });
  };
  const onGripUp = () => {
    const s = dragStart.current;
    if (!s || !drums) return;
    const over = drag?.over ?? s.index;
    dragStart.current = null;
    setDrag(null);
    if (over !== s.index) {
      const next = [...drums];
      const [moved] = next.splice(s.index, 1);
      next.splice(over, 0, moved);
      update(next);
    }
  };

  if (!drums) return null;
  const total = drums.reduce((n, d) => n + KIND[d.kind].minutes, 0);
  const ready = drums.length > 0 && drums.every((d) => d.taskId != null);

  return (
    <section className="rounded-3xl border-2 border-[color:var(--accent)]/50 bg-[color:var(--card)] p-4 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">🎰 השיעור של היום</p>
        <span className="rounded-full bg-[color:var(--background)] px-3 py-1 text-xs font-bold text-[color:var(--primary)]/70">~{total} דק׳</span>
      </div>

      {/* the drums row — scrolls sideways on a phone when there are many */}
      <div ref={rowRef} className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 pt-1" style={{ scrollbarWidth: "none" }}>
        {drums.map((d, i) => {
          const isDragged = drag?.id === d.id;
          // others slide out of the way while a drum is dragged across them
          let shift = 0;
          if (drag && !isDragged) {
            const from = drums.findIndex((x) => x.id === drag.id);
            const to = drag.over;
            const w = (rowRef.current?.querySelectorAll<HTMLElement>("[data-drum]")[from]?.getBoundingClientRect().width ?? 120) + 12;
            if (from < to && i > from && i <= to) shift = w; // RTL: later index = further left → shift right
            if (from > to && i >= to && i < from) shift = -w;
          }
          return (
            <DrumView
              key={d.id}
              drum={d}
              units={units}
              defaultTaskId={defaultFor(d.kind)}
              style={{ transform: isDragged ? `translateX(${drag!.dx}px)` : shift ? `translateX(${shift}px)` : undefined }}
              dragging={isDragged}
              canRemove={drums.length > 1}
              onGripDown={(e) => onGripDown(e, d.id)}
              onGripMove={onGripMove}
              onGripUp={onGripUp}
              onSelect={(taskId) => update(drums.map((x) => (x.id === d.id ? { ...x, taskId } : x)))}
              onAddSame={() => {
                // a second drum of the same kind rests on the unit AFTER this one
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() =>
            onStart(
              drums
                .filter((d) => d.taskId != null)
                .map((d) => ({ kind: d.kind, taskId: d.taskId as number, title: units.find((u) => u.taskId === d.taskId)?.title ?? "" }))
            )
          }
          className="rounded-full bg-[color:var(--accent)] px-7 py-3 text-base font-extrabold text-white shadow-lg transition hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
        >
          ▶ להתחיל את השיעור
        </button>
        <p className="text-[11px] leading-5 text-[color:var(--primary)]/55">
          מגלגלים כל גלגל ליחידה · ＋ מוסיף עוד גלגל מאותו סוג · גוררים באחיזה כדי לסדר
        </p>
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
  onGripDown: (e: React.PointerEvent) => void;
  onGripMove: (e: React.PointerEvent) => void;
  onGripUp: () => void;
  onSelect: (taskId: number) => void;
  onAddSame: () => void;
  onRemove: () => void;
  onShowUnit: (u: UnitOverview, x: number, y: number) => void;
}) {
  const k = KIND[drum.kind];
  const ITEM = 58;
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const [centered, setCentered] = useState(() => Math.max(0, units.findIndex((u) => u.taskId === drum.taskId)));
  const [pulse, setPulse] = useState(false);
  const settle = useRef<number | null>(null);

  // scroll the wheel to the selected unit on mount / external change
  useEffect(() => {
    const idx = units.findIndex((u) => u.taskId === drum.taskId);
    const el = wheelRef.current;
    if (!el || idx < 0) return;
    el.scrollTo({ top: idx * ITEM, behavior: "auto" });
    setCentered(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = wheelRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM);
    setCentered(idx);
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const u = units[Math.max(0, Math.min(units.length - 1, idx))];
      if (u && u.taskId != null && u.taskId !== drum.taskId) {
        onSelect(u.taskId);
        setPulse(true);
        window.setTimeout(() => setPulse(false), 250);
      }
    }, 140);
  };
  const scrollToIndex = (i: number) => wheelRef.current?.scrollTo({ top: i * ITEM, behavior: "smooth" });

  const defaultIdx = units.findIndex((u) => u.taskId === defaultTaskId);
  const selected = units[centered];
  const selectedDone = selected ? doneFor(selected, drum.kind) : false;
  const selectedAhead = defaultIdx >= 0 && centered > defaultIdx;

  return (
    <div
      data-drum
      className={`drum drum-in relative w-[150px] shrink-0 snap-center rounded-2xl border-2 bg-[color:var(--card)] ${dragging ? "dragging" : ""}`}
      style={{ ...style, borderColor: selectedDone ? DONE_COLOR : selectedAhead ? AHEAD_COLOR : k.color }}
    >
      {/* header = grip (drag here) */}
      <div
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        className="flex cursor-grab select-none items-center justify-between rounded-t-2xl px-2.5 py-2 text-white active:cursor-grabbing"
        style={{ background: selectedDone ? DONE_COLOR : selectedAhead ? AHEAD_COLOR : k.color, touchAction: "none" }}
        title="גררי כדי לשנות סדר"
      >
        <span className="text-sm font-extrabold">
          {k.emoji} {k.label}
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="text-[10px] tracking-[0.15em] opacity-70">⋮⋮</span>
          {canRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="להסיר גלגל"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px] hover:bg-white/35"
            >
              ✕
            </button>
          )}
        </span>
      </div>

      {/* the wheel */}
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 z-0 h-[52px] -translate-y-1/2 rounded-xl" style={{ background: `${selectedDone ? DONE_COLOR : selectedAhead ? AHEAD_COLOR : k.color}1a`, border: `1px solid ${selectedDone ? DONE_COLOR : selectedAhead ? AHEAD_COLOR : k.color}55` }} />
        <div
          ref={wheelRef}
          onScroll={onScroll}
          className="wheel relative z-10 overflow-y-auto"
          style={{ height: ITEM * 3, paddingBlock: ITEM }}
        >
          {units.map((u, i) => {
            const dist = Math.abs(i - centered);
            const done = doneFor(u, drum.kind);
            const ahead = defaultIdx >= 0 && i > defaultIdx;
            const tone = done ? DONE_COLOR : ahead ? AHEAD_COLOR : k.color;
            const num = u.position?.match(/משימה (\d+)/)?.[1] ?? String(i + 1);
            return (
              <button
                key={u.ref}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (i === centered) onShowUnit(u, e.clientX, e.clientY);
                  else scrollToIndex(i);
                }}
                className={`wheel-item flex w-full flex-col items-center justify-center px-2 text-center ${pulse && i === centered ? "tap-pulse" : ""}`}
                style={{
                  height: ITEM,
                  transform: `scale(${dist === 0 ? 1 : dist === 1 ? 0.84 : 0.72})`,
                  opacity: dist === 0 ? 1 : dist === 1 ? 0.5 : 0.25,
                  color: dist === 0 ? tone : "var(--primary)",
                }}
                title={u.title}
              >
                <span className="font-display text-lg font-extrabold leading-5">
                  {done ? "✓ " : ""}
                  {num}
                </span>
                <span className="mt-0.5 line-clamp-1 w-full text-[10px] font-semibold leading-3">{shortTitle(u.title)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* under the drum: "again?" note or the "+ another" affordance */}
      <div className="min-h-[38px] px-2 pb-2 text-center">
        {selectedDone ? (
          <p className="warn-in rounded-lg px-1.5 py-1 text-[10px] font-bold leading-4" style={{ background: `${DONE_COLOR}22`, color: "#5c5c52" }}>
            {doneWord[drum.kind]} · שוב?
          </p>
        ) : selectedAhead ? (
          <p className="warn-in rounded-lg px-1.5 py-1 text-[10px] font-bold leading-4" style={{ background: `${AHEAD_COLOR}22`, color: "#7a5b12" }}>
            מדלגים קדימה
          </p>
        ) : (
          <p className="text-[10px] font-semibold leading-4" style={{ color: k.color }}>
            הבאה בתור ✓
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAddSame}
        aria-label={`עוד ${k.label}`}
        title={`עוד ${k.label}`}
        className="absolute -start-3 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-[color:var(--card)] text-sm font-extrabold shadow transition hover:scale-110 active:scale-95"
        style={{ borderColor: k.color, color: k.color }}
      >
        ＋
      </button>
    </div>
  );
}

// =============================================================================
// Running bar (the lesson has started) — the strip's twin on this page
// =============================================================================

function RunningBar({ plan, busy, act }: { plan: LessonPlan; busy: boolean; act: (a: string) => Promise<void> }) {
  return (
    <section className="rounded-3xl border-2 border-[color:var(--accent)] bg-[color:var(--card)] p-4 sm:p-5">
      <p className="mb-3 font-display text-xl font-extrabold text-[color:var(--primary)]">▶ השיעור רץ</p>
      <ol className="flex flex-wrap items-center gap-2">
        {plan.blocks.map((b, i) => {
          const k = KIND[b.kind];
          const isNow = plan.current === i;
          const done = plan.current > i;
          return (
            <li
              key={`${b.kind}-${b.taskId}-${i}`}
              className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${done ? "opacity-45 line-through" : ""}`}
              style={{
                borderColor: k.color,
                background: isNow ? k.color : `${k.color}14`,
                color: isNow ? "#fff" : k.color,
              }}
              title={b.title}
            >
              {i + 1}. {k.emoji} {k.label}
              <span className={`max-w-[140px] truncate text-xs font-semibold ${isNow ? "text-white/85" : "opacity-70"}`}>{shortTitle(b.title)}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || plan.current === 0} onClick={() => act("prev")} className="rounded-full border border-[color:var(--border)] px-4 py-1.5 text-xs font-bold text-[color:var(--primary)] disabled:opacity-40">→ הקודם</button>
        {plan.current < plan.blocks.length - 1 ? (
          <button type="button" disabled={busy} onClick={() => act("next")} className="rounded-full bg-[color:var(--accent)] px-5 py-1.5 text-sm font-bold text-white shadow active:scale-95 disabled:opacity-40">הבא ←</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => act("stop")} className="rounded-full bg-[color:var(--success)] px-5 py-1.5 text-sm font-bold text-white shadow active:scale-95 disabled:opacity-40">✓ סיום השיעור</button>
        )}
        <button type="button" disabled={busy} onClick={() => act("cancel")} className="ms-auto text-[11px] font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--danger)]">לעצור ולתכנן מחדש</button>
      </div>
    </section>
  );
}

// =============================================================================
// The journey — every unit, three done-marks, tap for details
// =============================================================================

function Journey({ units, onShowUnit }: { units: UnitOverview[]; onShowUnit: (u: UnitOverview, x: number, y: number) => void }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">🗺️ המסע</p>
        <p className="text-[10px] text-[color:var(--primary)]/50">לחיצה על יחידה — פרטים וכלים</p>
      </div>
      <ol className="space-y-2">
        {units.map((u, i) => {
          const published = u.taskId != null;
          const pct = u.assigned ? Math.round((100 * u.complete) / u.assigned) : 0;
          const num = u.position?.match(/משימה (\d+)/)?.[1] ?? String(i + 1);
          return (
            <li key={u.ref}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowUnit(u, e.clientX, e.clientY);
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border bg-[color:var(--card)] p-3 text-start transition hover:border-[color:var(--accent)] active:scale-[0.995] ${published ? "border-[color:var(--border)]" : "border-dashed border-[color:var(--border)] opacity-60"}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)]/8 font-display text-base font-extrabold text-[color:var(--primary)]">
                  {num}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[color:var(--primary)]">{u.title}</span>
                  <span className="block text-[11px] text-[color:var(--primary)]/55">
                    {published ? `${u.complete}/${u.assigned} סיימו (${pct}%)` : "עוד לא פורסמה"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {(["review", "discussion", "study"] as BlockKind[]).map((kind) => {
                    const on = published && doneFor(u, kind);
                    return (
                      <span
                        key={kind}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm transition"
                        style={{
                          background: on ? `${KIND[kind].color}22` : "var(--background)",
                          border: `1.5px solid ${on ? KIND[kind].color : "var(--border)"}`,
                          opacity: on ? 1 : 0.35,
                          filter: on ? "none" : "grayscale(1)",
                        }}
                        title={`${KIND[kind].label}: ${on ? "נעשה ✓" : "עוד לא"}`}
                      >
                        {KIND[kind].emoji}
                      </span>
                    );
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// =============================================================================
// Unit popover — details + tools, no page change
// =============================================================================

function UnitPopover({ unit, x, y, onClose }: { unit: UnitOverview; x: number; y: number; onClose: () => void }) {
  const w = Math.min(340, typeof window !== "undefined" ? window.innerWidth - 24 : 340);
  const left = typeof window !== "undefined" ? Math.max(12, Math.min(x - w / 2, window.innerWidth - w - 12)) : 12;
  const top = typeof window !== "undefined" ? Math.min(y + 12, window.innerHeight - 260) : y;
  const pct = unit.assigned ? Math.round((100 * unit.complete) / unit.assigned) : 0;
  return (
    <div
      className="note-pop fixed z-[80] rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 shadow-2xl"
      style={{ left, top, width: w }}
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-display text-base font-extrabold leading-snug text-[color:var(--primary)]">{unit.title}</p>
        <button type="button" onClick={onClose} aria-label="סגירה" className="shrink-0 text-xs text-[color:var(--primary)]/50">✕</button>
      </div>
      <p className="text-[11px] text-[color:var(--primary)]/55">{unit.position}{unit.subtitle ? ` · ${unit.subtitle}` : ""}</p>
      {unit.taskId != null ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <Chip on={doneFor(unit, "review")} label={`🔁 חזרה${unit.reviewed ? ` ×${unit.reviewed}` : ""}`} color={KIND.review.color} />
            <Chip on={doneFor(unit, "discussion")} label={`💬 דיון${unit.discussed ? ` ×${unit.discussed}` : ""}`} color={KIND.discussion.color} />
            <Chip on={doneFor(unit, "study")} label={`📖 לימוד · ${pct}% סיימו`} color={KIND.study.color} />
          </div>
          {unit.question && (
            <p className="mt-2 rounded-lg bg-[color:var(--background)] px-3 py-2 text-xs leading-5 text-[color:var(--foreground)]/80">
              💬 {unit.question}
            </p>
          )}
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
    <span
      className="rounded-full px-2.5 py-0.5"
      style={{
        background: on ? `${color}22` : "var(--background)",
        color: on ? color : "var(--primary)",
        opacity: on ? 1 : 0.5,
        border: `1px solid ${on ? color : "var(--border)"}`,
      }}
    >
      {on ? "✓ " : ""}
      {label}
    </span>
  );
}

function shortTitle(t: string) {
  const s = t.replace(/^[״"]|[״"]$/g, "");
  return s.length > 22 ? s.slice(0, 20) + "…" : s;
}
