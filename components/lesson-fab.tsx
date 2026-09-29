"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import LessonPlanner from "./dashboard/lesson-planner";
import type { LessonPlan } from "@/lib/lesson-plan";

// The teacher's floating lesson button — on every teacher page except the
// lesson page itself. One tap slides up a sheet with the same three reels
// (and the running bar once the lesson has started), so composing or
// steering the lesson never means leaving the page you are on.
export default function LessonFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<LessonPlan | null>(null);

  const load = () =>
    fetch("/api/lesson-plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setPlan(d.plan);
      })
      .catch(() => {});
  useEffect(() => {
    load();
    window.addEventListener("lesson-plan-changed", load);
    const iv = setInterval(load, 30000);
    return () => {
      window.removeEventListener("lesson-plan-changed", load);
      clearInterval(iv);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!pathname || pathname.startsWith("/dashboard/lesson")) return null;
  // chrome-free projector / deck pages have no business showing it
  if (/\/(board|review)(\/|$)/.test(pathname) || pathname.startsWith("/dashboard/class-board")) return null;

  const running = plan != null && plan.current >= 0 && plan.blocks.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="השיעור של היום"
        title="השיעור של היום — הגלגלים"
        className={`fab-in fixed bottom-5 z-[45] flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-2xl transition hover:scale-105 active:scale-95 ${running ? "fab-live" : ""}`}
        style={{
          insetInlineStart: 18,
          background: "conic-gradient(from 200deg, #b96a3b 0 120deg, #413055 120deg 240deg, #3e6b4f 240deg 360deg)",
          padding: 4,
        }}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[color:var(--card)]">🎰</span>
        {running && (
          <span className="absolute -top-1 -end-1 rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-[10px] font-extrabold text-white shadow">
            ▶ {plan!.current + 1}/{plan!.blocks.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" dir="rtl">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="sheet-up absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-[color:var(--border)] p-4 pb-8 shadow-2xl sm:mx-auto sm:max-w-3xl sm:p-6"
            style={{ background: "var(--background)" }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--border)]" aria-hidden />
            <div className="mb-2 flex items-center justify-between">
              <a href="/dashboard/lesson" className="text-xs font-bold text-[color:var(--accent)] hover:underline">
                לעמוד המלא עם המסע ←
              </a>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1 text-xs font-bold text-[color:var(--primary)]">
                ✕ סגירה
              </button>
            </div>
            <LessonPlanner compact onStarted={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
