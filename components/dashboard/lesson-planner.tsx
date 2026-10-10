"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LessonPlan, PlanBlock, BlockKind, UnitOverview } from "@/lib/lesson-plan";
import Wheel3D, { type WheelItem } from "./wheel-3d";
import TicketsStrip from "./tickets-strip";
import { nextIndex, projectorUrl } from "@/lib/lesson-flow";
import { hasOpening } from "@/content/openings/registry";

// the one tool each block needs, in plain words
export function toolsFor(kind: BlockKind, taskId: number): { href: string; label: string; newTab?: boolean; primary?: boolean }[] {
  switch (kind) {
    case "review":
      return [{ href: `/dashboard/review/${taskId}`, label: "🖥️ לפתוח את מצגת החזרה", newTab: true, primary: true }];
    case "discussion":
      return [
        { href: `/dashboard/discussion/${taskId}/control`, label: "🎫 כרטיסי כניסה ושאלת הדיון", primary: true },
        { href: `/dashboard/discussion/${taskId}/board`, label: "🖥️ להקרין את לוח הדיון", newTab: true },
      ];
    case "study":
      return [
        { href: `/tasks/${taskId}`, label: "📖 לפתוח את המשימה", primary: true },
        { href: `/dashboard/class-board/${taskId}`, label: "🖥️ להקרין את לוח הכיתה", newTab: true },
      ];
  }
}

// מהלך השיעור — built around THE REELS: three slot reels (חזרה · דיון ·
// לימוד), each rolled to a unit. They rest by default on the next unit not
// yet done for that kind. Rolling back lands on "already done" (grey,
// ticked, stamped); rolling ahead on "skipping" (dashed amber, striped).
// "+" beside a reel adds another of its kind; reels drag to reorder with a
// real slide-into-place; ▶ starts the lesson at once. The same builder
// renders full-size on the lesson page and mini in the floating dock on
// every other teacher page.
//
// Everything is the teacher's to decide, before and during the lesson: a
// reel's KIND changes from its header (so any set of reels can be rebuilt
// from a single one), the chips under the row add a reel of any kind, and
// while the lesson runs she can jump to any block, and open the same reels
// to reorder / add / remove / re-roll without stopping.

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
  ref: string | null; // the unit's content ref — it may have no task yet
}
const KINDS: BlockKind[] = ["review", "discussion", "study"];
// a fresh reel identity (called from tap handlers only)
const freshId = (kind: BlockKind) => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}-${kind}`;
const MAX_REELS = 12;
// a unit the class actually has: published and assigned to someone
export function assignedOK(u: UnitOverview | undefined | null): boolean {
  return !!u && u.taskId != null && u.assigned > 0;
}

export function doneFor(u: UnitOverview, kind: BlockKind): boolean {
  // the teacher said "not done" — her word beats what the data suggests
  if (u.off?.includes(kind)) return false;
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
  const act = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/lesson-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(extra ?? {}) }),
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
  // give units to the class straight from the reels / a popover
  const publishUnits = async (refs: string[], dueDate?: string): Promise<UnitOverview[]> => {
    const r = await fetch("/api/lesson-plan/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", refs, dueDate }),
    });
    const d = await r.json();
    apply(d);
    return d.units ?? [];
  };
  return { plan, units, busy, setBusy, act, persist, markUnit, markUpTo, publishUnits };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
export default function LessonPlanner() {
  const { plan, units, busy, setBusy, act, persist, markUnit, markUpTo, publishUnits } = useLessonPlan();
  const [popover, setPopover] = useState<{ ref: string; x: number; y: number } | null>(null);
  // the popover shows the LIVE unit, so a tick inside it is visible at once
  const popUnit = popover ? units.find((u) => u.ref === popover.ref) ?? null : null;
  // the reels can be opened while the lesson runs — it keeps running
  const [editing, setEditing] = useState(false);
  if (!plan) return <p className="p-6 text-center text-sm text-[color:var(--primary)]/60">טוען…</p>;
  const running = plan.current >= 0 && plan.blocks.length > 0;
  return (
    <div className="space-y-8" dir="rtl" onClick={() => setPopover(null)}>
      {running && <RunningBar plan={plan} busy={busy} act={act} editing={editing} onEdit={() => setEditing((e) => !e)} />}
      {(!running || editing) && (
        <WheelBuilder
          key={running ? "edit" : "build"}
          units={units}
          savedBlocks={plan.blocks}
          busy={busy}
          live={running ? { currentId: plan.blocks[plan.current]?.id ?? null, onDone: () => setEditing(false) } : undefined}
          onPublish={publishUnits}
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
        <UnitPopover unit={popUnit} x={popover.x} y={popover.y} onClose={() => setPopover(null)} onMark={markUnit} onMarkUpTo={markUpTo} onPublish={publishUnits} />
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
  onPublish,
  onShowUnit,
  mini = false,
  live,
}: {
  units: UnitOverview[];
  savedBlocks: PlanBlock[];
  busy: boolean;
  // set while a lesson is running: the reels edit the plan in place (the
  // lesson goes on, "now" stays on its reel) and the big button closes them
  live?: { currentId: string | null; onDone: () => void };
  onStart: (blocks: PlanBlock[]) => Promise<void>;
  onPersist: (blocks: PlanBlock[]) => Promise<void>;
  // give units to the class (returns the fresh unit list); the start button
  // does it by itself for any reel resting on a unit the class does not have
  onPublish?: (refs: string[]) => Promise<UnitOverview[]>;
  onShowUnit?: (u: UnitOverview, x: number, y: number) => void;
  mini?: boolean;
}) {
  const defaultFor = useCallback(
    (kind: BlockKind): string | null => {
      const u = units.find((x) => !doneFor(x, kind)) ?? units[units.length - 1];
      return u?.ref ?? null;
    },
    [units]
  );
  const [drums, setDrums] = useState<Drum[] | null>(null);
  useEffect(() => {
    if (drums != null || units.length === 0) return;
    if (savedBlocks.length > 0)
      setDrums(savedBlocks.map((b, i) => ({ id: b.id ?? `d${i}-${b.kind}`, kind: b.kind, ref: units.find((u) => u.taskId === b.taskId)?.ref ?? null })));
    else setDrums((["review", "discussion", "study"] as BlockKind[]).map((kind, i) => ({ id: `d${i}-${kind}`, kind, ref: defaultFor(kind) })));
  }, [units, savedBlocks, drums, defaultFor]);
  // a reel the teacher never rolled sits on the default; when she ticks a
  // unit as done the default moves on — and so does that reel
  const prevDefaults = useRef<Record<BlockKind, string | null> | null>(null);
  useEffect(() => {
    const cur: Record<BlockKind, string | null> = { review: defaultFor("review"), discussion: defaultFor("discussion"), study: defaultFor("study") };
    const prev = prevDefaults.current;
    prevDefaults.current = cur;
    // mid-lesson the reels are the running plan itself: a block that was just
    // run must stay on its unit, not slide on to the next one
    if (!prev || !drums || live) return;
    const moved = (["review", "discussion", "study"] as BlockKind[]).filter((k) => prev[k] !== cur[k]);
    if (moved.length === 0) return;
    setDrums((ds) => {
      if (!ds) return ds;
      let changed = false;
      const next = ds.map((d) => {
        if (moved.includes(d.kind) && d.ref === prev[d.kind]) {
          changed = true;
          return { ...d, ref: cur[d.kind] };
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
  const toBlocks = (ds: Drum[], us: UnitOverview[] = units): PlanBlock[] =>
    ds
      .map((d) => ({ d, u: us.find((u) => u.ref === d.ref) }))
      .filter((x) => x.u?.taskId != null)
      .map(({ d, u }) => ({ kind: d.kind, taskId: u!.taskId as number, title: u!.title, id: d.id }));
  const update = (next: Drum[]) => {
    setDrums(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void onPersist(toBlocks(next)), 600);
  };
  // a reel changes its kind from its header. A reel she never rolled (still
  // resting on its kind's "next in line") moves to the new kind's next in line.
  const changeKind = (id: string, kind: BlockKind) => {
    if (!drums) return;
    update(drums.map((d) => (d.id !== id || d.kind === kind ? d : { ...d, kind, ref: d.ref === defaultFor(d.kind) ? defaultFor(kind) : d.ref })));
  };
  // a new reel of any kind, at the end of the row: on the unit after the
  // last reel of that kind, or on the kind's next in line when there is none
  const addKind = (kind: BlockKind) => {
    if (!drums || drums.length >= MAX_REELS) return;
    const last = [...drums].reverse().find((d) => d.kind === kind);
    let ref = defaultFor(kind);
    if (last) {
      const idx = units.findIndex((u) => u.ref === last.ref);
      ref = units[Math.min(units.length - 1, Math.max(0, idx + 1))]?.ref ?? last.ref;
    }
    update([...drums, { id: freshId(kind), kind, ref }]);
  };

  // ---- drag a reel to reorder: the dragged reel follows the pointer 1:1
  // and lifts; the others slide into their new slots as it crosses them;
  // on release it glides into its slot, and only then the order commits ----
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; over: number; settling: boolean } | null>(null);
  const [starting, setStarting] = useState(false);
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
  // reels resting on a unit the class does not have yet: the start button
  // gives it to the class first, in the same tap
  const missing = drums.filter((d) => !assignedOK(units.find((u) => u.ref === d.ref)));
  const missingRefs = [...new Set(missing.map((d) => d.ref).filter((r): r is string => !!r))];
  const ready = drums.length > 0 && drums.every((d) => d.ref != null) && (missing.length === 0 || !!onPublish);
  const start = async () => {
    setStarting(true);
    // ▶ opens the projector screen of the first block at once (deck, debate
    // board or class board); from there the projector follows the plan by
    // itself. The window must be opened inside the tap (pop-up rules).
    const projWin = window.open("about:blank", "_blank");
    try {
      let us = units;
      if (missingRefs.length > 0 && onPublish) us = await onPublish(missingRefs);
      const blocks = toBlocks(drums, us);
      await onStart(blocks);
      const first = blocks[0];
      if (projWin) {
        if (first) projWin.location.href = projectorUrl(first.kind, first.taskId);
        else projWin.close();
      }
    } catch {
      projWin?.close();
    } finally {
      setStarting(false);
    }
  };
  // closing the reels mid-lesson: give the class any unit it does not have
  // yet, save at once (not after the debounce), and fold the reels away
  const finishEdit = async () => {
    setStarting(true);
    try {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      let us = units;
      if (missingRefs.length > 0 && onPublish) us = await onPublish(missingRefs);
      await onPersist(toBlocks(drums, us));
      live?.onDone();
    } finally {
      setStarting(false);
    }
  };
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
              defaultRef={defaultFor(d.kind)}
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
              onSelect={(ref) => update(drums.map((x) => (x.id === d.id ? { ...x, ref } : x)))}
              onAddSame={() => {
                const idx = units.findIndex((u) => u.ref === d.ref);
                const nextUnit = units[Math.min(units.length - 1, Math.max(0, idx + 1))];
                if (drums.length >= MAX_REELS) return;
                const fresh: Drum = { id: freshId(d.kind), kind: d.kind, ref: nextUnit?.ref ?? d.ref };
                const next = [...drums];
                next.splice(i + 1, 0, fresh);
                update(next);
              }}
              onKind={(kind) => changeKind(d.id, kind)}
              isNow={!!live && live.currentId === d.id}
              onRemove={() => update(drums.filter((x) => x.id !== d.id))}
              onShowUnit={onShowUnit}
            />
          );
        })}
      </div>

      {/* a new reel of ANY kind, one tap */}
      <div className={`flex flex-wrap items-center gap-1.5 ${mini ? "px-1 pt-0.5" : "px-1 pt-1"}`}>
        <span className={`font-bold text-[color:var(--primary)]/60 ${mini ? "text-[10px]" : "text-xs"}`}>＋ גלגל חדש:</span>
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            data-add-reel={kind}
            disabled={drums.length >= MAX_REELS}
            onClick={() => addKind(kind)}
            className={`rounded-full border-2 bg-[color:var(--card)] font-extrabold shadow-sm transition hover:scale-[1.05] active:scale-90 disabled:opacity-35 ${mini ? "px-2.5 py-0.5 text-[11px]" : "px-3.5 py-1 text-sm"}`}
            style={{ borderColor: KIND[kind].color, color: KIND[kind].color }}
          >
            ＋ {KIND[kind].emoji} {KIND[kind].label}
          </button>
        ))}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-2 ${mini ? "mt-1.5 px-1" : "mt-3 px-1"}`}>
        {live ? (
          <button
            type="button"
            disabled={busy || starting || !ready}
            onClick={finishEdit}
            className={`rounded-full font-extrabold text-white shadow-lg transition hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 ${starting ? "animate-pulse" : ""} ${mini ? "px-5 py-2 text-sm" : "px-7 py-3 text-base"}`}
            style={{ background: "var(--success)" }}
          >
            {starting ? "שומרים…" : "✓ סיימתי לשנות — ממשיכים"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || starting || !ready}
            onClick={start}
            className={`rounded-full font-extrabold text-white shadow-lg transition hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 ${starting ? "animate-pulse" : ""} ${mini ? "px-5 py-2 text-sm" : "px-7 py-3 text-base"}`}
            style={{ background: missingRefs.length > 0 ? AHEAD_COLOR : "var(--accent)" }}
            title={missingRefs.length > 0 ? "היחידה עוד לא הוקצתה לכיתה — תוקצה לכולן (הגשה בעוד שבוע) ואז השיעור יתחיל" : undefined}
          >
            {starting ? (missingRefs.length > 0 ? "מקצים לכיתה…" : "מתחילים…") : missingRefs.length > 0 ? "📣 להקצות לכיתה ולהתחיל" : "▶ להתחיל את השיעור"}
          </button>
        )}
        <span className={`text-[color:var(--primary)]/50 ${mini ? "text-[10px]" : "text-[11px]"}`}>
          {live ? "השיעור ממשיך לרוץ — כל שינוי נשמר מיד · " : missingRefs.length > 0 ? "📣 יחידה שעוד לא הוקצתה תוקצה לכל הכיתה בהתחלה · " : ""}~{total} דק׳ · מעלה-מטה מגלגל · לצדדים מסדר · לחיצה על שם הגלגל מחליפה סוג
        </span>
      </div>
    </section>
  );
}

function DrumView({
  drum,
  units,
  defaultRef,
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
  onKind,
  isNow,
  onRemove,
  onShowUnit,
}: {
  drum: Drum;
  onKind: (kind: BlockKind) => void;
  isNow: boolean; // the block running right now (reels opened mid-lesson)
  units: UnitOverview[];
  defaultRef: string | null;
  style?: React.CSSProperties;
  dragging: boolean;
  canRemove: boolean;
  mini: boolean;
  width: number;
  compact: boolean;
  onGripDown: (e: React.PointerEvent) => void;
  onGripMove: (e: React.PointerEvent) => void;
  onGripUp: () => void;
  onSelect: (ref: string) => void;
  onAddSame: () => void;
  onRemove: () => void;
  onShowUnit?: (u: UnitOverview, x: number, y: number) => void;
}) {
  const k = KIND[drum.kind];
  const defaultIdx = units.findIndex((u) => u.ref === defaultRef);
  const index = Math.max(0, units.findIndex((u) => u.ref === drum.ref));
  const selected = units[index];
  const selectedUnassigned = !assignedOK(selected);
  const selectedDone = selected ? doneFor(selected, drum.kind) : false;
  const selectedAhead = defaultIdx >= 0 && index > defaultIdx;
  const state: "done" | "ahead" | "next" = selectedDone ? "done" : selectedAhead ? "ahead" : "next";
  const tone = state === "done" ? DONE_COLOR : state === "ahead" ? AHEAD_COLOR : k.color;

  // the kind menu: opens under the reel's name. It is rendered in a portal
  // so the reel's own greying / dragging transform never touches it.
  const kindBtn = useRef<HTMLButtonElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  const openMenu = () => {
    const r = kindBtn.current?.getBoundingClientRect();
    if (!r) return;
    const w = 148;
    setMenu((m) => (m ? null : { x: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)), y: r.bottom + 6 }));
  };

  const items: WheelItem[] = units.map((u, i) => {
    const done = doneFor(u, drum.kind);
    const ahead = defaultIdx >= 0 && i > defaultIdx;
    return { key: `${drum.id}-${u.ref}`, num: unitNum(u, i), label: shortTitle(u.title), tone: done ? DONE_COLOR : ahead ? AHEAD_COLOR : k.color, done, state: done ? "done" : ahead ? "ahead" : "next", unassigned: !assignedOK(u) };
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
        {/* the reel's name is a button: tap → choose its kind */}
        <button
          ref={kindBtn}
          type="button"
          data-kind-button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); openMenu(); }}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          aria-label={`סוג הגלגל: ${k.label} — לחיצה מחליפה`}
          title="לחיצה מחליפה את סוג הגלגל"
          className={`flex min-w-0 items-center gap-0.5 truncate rounded-full bg-white/15 font-extrabold transition hover:bg-white/30 active:scale-95 ${compact ? "px-1 py-0.5 text-[10px]" : mini ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm"}`}
        >
          {/* compact reels leave the ✓ / ⏭ to the ribbon — the word must fit */}
          <span className="truncate">
            {compact ? "" : state === "done" ? "✓ " : state === "ahead" ? "⏭ " : ""}
            {k.emoji} {k.label}
          </span>
          <span aria-hidden className="text-[9px] opacity-80">▾</span>
        </button>
        {menu &&
          createPortal(
            <div
              role="menu"
              dir="rtl"
              className="note-pop fixed z-[97] w-[148px] rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-1.5 shadow-2xl"
              style={{ left: menu.x, top: menu.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="px-2 pb-1 text-[10px] font-bold text-[color:var(--primary)]/55">סוג הגלגל</p>
              {KINDS.map((kind) => {
                const on = kind === drum.kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    data-kind-option={kind}
                    onClick={() => { setMenu(null); if (!on) onKind(kind); }}
                    className="mb-0.5 flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-sm font-extrabold transition active:scale-95"
                    style={on ? { background: KIND[kind].color, color: "#fff" } : { color: KIND[kind].color, background: `${KIND[kind].color}12` }}
                  >
                    <span>{KIND[kind].emoji} {KIND[kind].label}</span>
                    {on && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>,
            document.body
          )}
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
        {isNow && (
          <span className="pointer-events-none absolute inset-x-0 top-1 z-30 flex justify-center">
            <span className="rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-[10px] font-extrabold text-white shadow">▶ עכשיו</span>
          </span>
        )}
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
            if (u && u.ref !== drum.ref) onSelect(u.ref);
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
        ) : selectedUnassigned ? (
          <p key="unassigned" className={`warn-in rounded-lg px-1 py-0.5 font-bold leading-4 ${mini ? "text-[9px]" : "text-[10px]"}`} style={{ background: `${AHEAD_COLOR}22`, color: "#7a5b12" }}>
            📣 עוד לא הוקצתה
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
export function RunningBar({
  plan,
  busy,
  act,
  mini = false,
  editing = false,
  onEdit,
}: {
  plan: LessonPlan;
  busy: boolean;
  act: (a: string, extra?: Record<string, unknown>) => Promise<void>;
  mini?: boolean;
  editing?: boolean;
  onEdit?: () => void; // open / close the reels without stopping the lesson
}) {
  const cur = plan.blocks[plan.current];
  const nextAt = nextIndex(plan);
  const curKind = cur ? KIND[cur.kind] : null;
  const tools = cur ? toolsFor(cur.kind, cur.taskId) : [];
  // the debate whose tickets matter now: the one running, else the next one
  const debateIdx = cur?.kind === "discussion" ? plan.current : plan.blocks.findIndex((b, i) => i > plan.current && b.kind === "discussion");
  const debate = debateIdx >= 0 ? plan.blocks[debateIdx] : null;
  return (
    <section className={mini ? "space-y-2" : "space-y-3 rounded-3xl border-2 border-[color:var(--accent)] bg-[color:var(--card)] p-4 sm:p-5"}>
      {!mini && <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">▶ השיעור רץ</p>}
      {cur && curKind && (
        <div className={`rounded-2xl border-2 ${mini ? "px-3 py-2" : "px-4 py-3"}`} style={{ borderColor: curKind.color, background: `${curKind.color}10` }}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className={`font-extrabold text-[color:var(--primary)] ${mini ? "text-sm" : "text-lg"}`}>
              עכשיו: {curKind.emoji} {curKind.label}
              <span className={`ms-2 font-semibold text-[color:var(--foreground)]/70 ${mini ? "text-xs" : "text-sm"}`}>{shortTitle(cur.title)}</span>
            </p>
            <span className="flex flex-wrap items-center gap-1.5">
              {tools.map((t) => (
                <a
                  key={t.href}
                  href={t.href}
                  target={t.newTab ? "_blank" : undefined}
                  rel={t.newTab ? "noopener noreferrer" : undefined}
                  className={`rounded-full font-extrabold shadow transition hover:scale-[1.03] active:scale-95 ${mini ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} ${t.primary ? "text-white" : "border-2 bg-[color:var(--card)]"}`}
                  style={t.primary ? { background: curKind.color } : { borderColor: curKind.color, color: curKind.color }}
                >
                  {t.label}
                </a>
              ))}
            </span>
          </div>
        </div>
      )}
      {debate && (
        <TicketsStrip taskId={debate.taskId} heading={debateIdx === plan.current ? "כרטיסי כניסה לדיון" : "כרטיסי כניסה לדיון הבא"} compact={mini} />
      )}
      {/* every block is a button: tap → the lesson jumps there, ahead or back,
          done or not. The order is hers. */}
      <ol className="flex flex-wrap items-center gap-2">
        {plan.blocks.map((b, i) => {
          const k = KIND[b.kind];
          const isNow = plan.current === i;
          const done = !!b.done && !isNow;
          return (
            <li key={b.id ?? `${b.kind}-${b.taskId}-${i}`}>
              <button
                type="button"
                data-block-chip={i}
                disabled={busy || isNow}
                onClick={() => act("goto", { index: i })}
                aria-current={isNow ? "step" : undefined}
                className={`flex items-center gap-2 rounded-full border-2 font-bold transition active:scale-95 disabled:cursor-default ${mini ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${done ? "opacity-55" : ""} ${isNow ? "scale-105 shadow-md" : "hover:scale-[1.04] hover:shadow"}`}
                style={{ borderColor: k.color, background: isNow ? k.color : `${k.color}14`, color: isNow ? "#fff" : k.color }}
                title={isNow ? `עכשיו: ${b.title}` : done ? `${b.title} — כבר נעשה היום · לחיצה חוזרת אליו` : `${b.title} — לחיצה קופצת לכאן`}
              >
                {done ? "✓" : `${i + 1}.`} {k.emoji} {k.label}
                {!mini && <span className={`max-w-[140px] truncate text-xs font-semibold ${isNow ? "text-white/85" : "opacity-70"}`}>{shortTitle(b.title)}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <p className={`text-[color:var(--primary)]/50 ${mini ? "text-[10px]" : "text-[11px]"}`}>לחיצה על שלב קופצת אליו — בכל סדר, גם חזרה לשלב שכבר נעשה</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || plan.current === 0} onClick={() => act("prev")} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)] active:scale-95 disabled:opacity-40">→ הקודם</button>
        {nextAt >= 0 && (
          <button type="button" disabled={busy} onClick={() => act("next")} className="rounded-full bg-[color:var(--accent)] px-4 py-1 text-sm font-bold text-white shadow active:scale-95 disabled:opacity-40">
            הבא ← {KIND[plan.blocks[nextAt].kind].emoji}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => act("stop")}
          className={`rounded-full px-4 py-1 text-sm font-bold shadow active:scale-95 disabled:opacity-40 ${nextAt >= 0 ? "border-2 border-[color:var(--success)] bg-[color:var(--card)] text-[color:var(--success)]" : "bg-[color:var(--success)] text-white"}`}
        >
          ✓ סיום השיעור
        </button>
        {onEdit && (
          <button
            type="button"
            data-edit-lesson
            onClick={onEdit}
            aria-pressed={editing}
            className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold transition active:scale-95 ${editing ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white" : "border-[color:var(--accent)] bg-[color:var(--card)] text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10"}`}
          >
            {editing ? "▲ לסגור את הגלגלים" : "✏️ לשנות את השיעור"}
          </button>
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
  // her word is final in both directions: any circle can be ticked or cleared
  const toggle = async (u: UnitOverview, kind: BlockKind, on: boolean) => {
    if (u.taskId == null) return;
    await onMark(u.taskId, kind, on);
  };
  return (
    <section className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">🗺️ המסע</p>
        <p className="text-end text-[10px] leading-4 text-[color:var(--primary)]/50">לחיצה על יחידה — פרטים וכלים · לחיצה על עיגול — סימון ״כבר נעשה״ (ושוב — ביטול)</p>
      </div>
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
  onPublish,
}: {
  unit: UnitOverview;
  x: number;
  y: number;
  onClose: () => void;
  onMark?: (taskId: number, kind: BlockKind, on: boolean) => Promise<UnitOverview[]>;
  onMarkUpTo?: (taskId: number) => Promise<void>;
  onPublish?: (refs: string[], dueDate?: string) => Promise<UnitOverview[]>;
}) {
  const [upTo, setUpTo] = useState<"idle" | "working" | "done">("idle");
  const [pub, setPub] = useState<"idle" | "working" | "done">("idle");
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA"));
  const unassigned = !assignedOK(unit);
  // the panel stays up through the "done ✓" beat even though the unit is
  // assigned by then — the tap has to be seen to land
  const publishPanel = onPublish && (unassigned || pub !== "idle") && (
    <div className="mt-2 rounded-xl border-2 border-dashed px-3 py-2" style={{ borderColor: AHEAD_COLOR, background: `${AHEAD_COLOR}14` }}>
      <p className="text-xs font-extrabold" style={{ color: "#7a5b12" }}>
        {unit.taskId == null ? "📣 היחידה עוד לא הוקצתה לכיתה" : "📣 היחידה ירדה מהכיתה — להקצות שוב?"}
      </p>
      <label className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-[color:var(--primary)]/70">
        הגשה עד
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-md border border-[color:var(--border)] bg-white px-2 py-0.5 text-xs" />
      </label>
      <button
        type="button"
        disabled={pub !== "idle"}
        onClick={async () => {
          setPub("working");
          try {
            await onPublish([unit.ref], dueDate);
            setPub("done");
            window.setTimeout(() => setPub("idle"), 1800);
          } catch {
            setPub("idle");
          }
        }}
        className={`mt-2 w-full rounded-xl px-3 py-1.5 text-xs font-extrabold text-white transition-all duration-300 active:scale-[0.98] ${pub === "working" ? "animate-pulse" : ""}`}
        style={{ background: pub === "done" ? "var(--success)" : AHEAD_COLOR }}
      >
        {pub === "done" ? "הוקצתה לכל הכיתה ✓" : pub === "working" ? "מקצים…" : "📣 להקצות לכל הכיתה"}
      </button>
    </div>
  );
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
          {publishPanel}
          {unit.question && <p className="mt-2 rounded-lg bg-[color:var(--background)] px-3 py-2 text-xs leading-5 text-[color:var(--foreground)]/80">💬 {unit.question}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
            {hasOpening(unit.ref) && <OpeningLink to={String(unit.taskId)} />}
            <a href={`/dashboard/review/${unit.taskId}`} target="_blank" rel="noopener noreferrer" className="rounded-full px-3 py-1 text-white" style={{ background: KIND.review.color }}>🔁 מצגת החזרה ↗</a>
            <a href={`/dashboard/discussion/${unit.taskId}/control`} className="rounded-full px-3 py-1 text-white" style={{ background: KIND.discussion.color }}>🎫 כרטיסי כניסה ועריכת שאלת הדיון</a>
            <a href={`/dashboard/discussion/${unit.taskId}/board`} target="_blank" rel="noopener noreferrer" className="rounded-full border px-3 py-1" style={{ borderColor: KIND.discussion.color, color: KIND.discussion.color }}>🖥️ להקרין את לוח הדיון ↗</a>
            <a href={`/tasks/${unit.taskId}`} className="rounded-full px-3 py-1 text-white" style={{ background: KIND.study.color }}>📖 פתיחת המשימה</a>
            <a href={`/dashboard/content/${unit.ref}`} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[color:var(--primary)]">✏️ עריכת התוכן</a>
          </div>
        </>
      ) : (
        <>
          {publishPanel ?? <p className="mt-2 text-xs text-[color:var(--warning)]">היחידה עוד לא הוקצתה לכיתה.</p>}
          {unit.question && <p className="mt-2 rounded-lg bg-[color:var(--background)] px-3 py-2 text-xs leading-5 text-[color:var(--foreground)]/80">💬 {unit.question}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
            {hasOpening(unit.ref) && <OpeningLink to={unit.ref} />}
            <a href={`/dashboard/content/${unit.ref}`} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[color:var(--primary)]">✏️ עריכת התוכן</a>
          </div>
        </>
      )}
    </div>
  );
}

// the unit's opening deck (only units that have one) — by task id, or by ref
// while the unit is not published yet
function OpeningLink({ to }: { to: string }) {
  return (
    <a href={`/dashboard/opening/${to}`} target="_blank" rel="noopener noreferrer" className="rounded-full px-3 py-1 text-[#1c150b]" style={{ background: "#d9b46c" }}>
      ▶ פתיחה ↗
    </a>
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
