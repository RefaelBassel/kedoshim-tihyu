"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RunningBar, UnitPopover, WheelBuilder, useLessonPlan } from "./dashboard/lesson-planner";
import type { UnitOverview } from "@/lib/lesson-plan";

// The floating lesson dock — the three reels themselves, small, docked to
// the bottom of every teacher page (mounted once in the root layout). Roll,
// add a reel, drag to reorder, ▶ — right there, no window to open. One tap
// folds it into a slim pill (remembered), one tap unfolds it. While a lesson
// runs it shows the running bar. Hidden on the lesson page (which has the
// full-size reels) and on projector / deck screens.
export default function LessonDock() {
  const pathname = usePathname();
  const hidden =
    !pathname ||
    pathname.startsWith("/dashboard/lesson") ||
    /\/(board|review)(\/|$)/.test(pathname) ||
    pathname.startsWith("/dashboard/class-board") ||
    pathname === "/login" ||
    pathname === "/onboarding" ||
    pathname === "/pending";

  const { plan, units, busy, setBusy, act, persist, markUnit, markUpTo, publishUnits } = useLessonPlan();
  const [folded, setFolded] = useState(true);
  const [popover, setPopover] = useState<{ ref: string; x: number; y: number } | null>(null);
  const popUnit: UnitOverview | null = popover ? units.find((u) => u.ref === popover.ref) ?? null : null;
  useEffect(() => {
    try {
      setFolded(localStorage.getItem("lesson-dock-folded") !== "0");
    } catch {
      /* private mode */
    }
  }, []);
  const toggle = () => {
    setFolded((f) => {
      try {
        localStorage.setItem("lesson-dock-folded", f ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !f;
    });
  };

  if (hidden || !plan) return null;
  const running = plan.current >= 0 && plan.blocks.length > 0;
  const cur = running ? plan.blocks[plan.current] : null;

  return (
    <>
      <div className="dock-in fixed inset-x-0 bottom-0 z-[45] flex justify-center px-2 pb-2 sm:px-4" dir="rtl" style={{ pointerEvents: "none" }}>
        <div
          className="w-full max-w-3xl rounded-3xl border-2 border-[color:var(--accent)]/60 shadow-2xl backdrop-blur"
          style={{ pointerEvents: "auto", background: "color-mix(in srgb, var(--card) 92%, transparent)", transition: "max-height 0.35s cubic-bezier(0.22,1,0.36,1)" }}
        >
          {/* the pill / header — always visible */}
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center justify-between gap-3 px-4 py-2 text-start"
            aria-expanded={!folded}
            aria-label={folded ? "לפתוח את הגלגלים" : "לקפל את הגלגלים"}
          >
            <span className="flex items-center gap-2 font-display text-base font-extrabold text-[color:var(--primary)]">
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-base ${running ? "fab-live" : ""}`} style={{ background: "conic-gradient(from 200deg, #b96a3b 0 120deg, #413055 120deg 240deg, #3e6b4f 240deg 360deg)" }}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--card)] text-[11px]">🎰</span>
              </span>
              {running && cur ? (
                <span>
                  עכשיו: {cur.kind === "review" ? "🔁 חזרה" : cur.kind === "discussion" ? "💬 דיון" : "📖 לימוד"} · <span className="text-sm font-semibold text-[color:var(--foreground)]/75">{cur.title.length > 26 ? cur.title.slice(0, 24) + "…" : cur.title}</span>
                  <span className="ms-2 rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-[10px] font-extrabold text-white">{plan.current + 1}/{plan.blocks.length}</span>
                </span>
              ) : (
                <span>השיעור של היום</span>
              )}
            </span>
            <span className="text-xs font-bold text-[color:var(--primary)]/60">{folded ? "▲ לפתוח" : "▼ לקפל"}</span>
          </button>

          {!folded && (
            <div className="border-t border-[color:var(--border)] px-2 pb-2 pt-2 sm:px-3" onClick={() => setPopover(null)}>
              {running ? (
                <RunningBar plan={plan} busy={busy} act={act} mini />
              ) : (
                <WheelBuilder
                  units={units}
                  savedBlocks={plan.blocks}
                  busy={busy}
                  onPublish={publishUnits}
                  mini
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
            </div>
          )}
        </div>
      </div>
      {popover && popUnit && (
        <UnitPopover unit={popUnit} x={popover.x} y={popover.y} onClose={() => setPopover(null)} onMark={markUnit} onMarkUpTo={markUpTo} onPublish={publishUnits} />
      )}
    </>
  );
}
