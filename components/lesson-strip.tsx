"use client";

import { useEffect, useState } from "react";
import type { LessonPlan, BlockKind } from "@/lib/lesson-plan";

// The live lesson strip — teacher only, on every teacher page once today's
// plan is started: what is happening NOW, what comes next, the right tool
// one click away, and "next" to move on. State lives on the server, so it
// follows her from the laptop to the phone and across pages.
const KIND: Record<BlockKind, { emoji: string; label: string }> = {
  review: { emoji: "🔁", label: "חזרה" },
  discussion: { emoji: "💬", label: "דיון" },
  study: { emoji: "📖", label: "לימוד" },
};

function toolsFor(kind: BlockKind, taskId: number) {
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

export default function LessonStrip() {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/lesson-plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setPlan(d.plan);
      })
      .catch(() => {});
  useEffect(() => {
    load();
    const iv = setInterval(load, 20000);
    // the planner announces changes so the strip appears the moment ▶ is pressed
    window.addEventListener("lesson-plan-changed", load);
    return () => {
      clearInterval(iv);
      window.removeEventListener("lesson-plan-changed", load);
    };
  }, []);

  const act = async (action: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/lesson-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (d.ok) setPlan(d.plan);
    } finally {
      setBusy(false);
    }
  };

  if (!plan || plan.current < 0 || plan.blocks.length === 0) return null;
  const cur = plan.blocks[plan.current];
  const next = plan.blocks[plan.current + 1];
  const k = KIND[cur.kind];
  const tools = toolsFor(cur.kind, cur.taskId);

  return (
    <div
      className="sticky top-[57px] z-30 border-b border-[color:var(--accent)]/40 px-4 py-2 text-sm shadow-sm"
      style={{ background: "color-mix(in srgb, var(--accent) 10%, var(--card))" }}
      dir="rtl"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <span className="rounded-full bg-[color:var(--accent)] px-2.5 py-0.5 text-[11px] font-bold text-white">
          {plan.current + 1}/{plan.blocks.length}
        </span>
        <span className="font-bold text-[color:var(--primary)]">
          עכשיו: {k.emoji} {k.label} · <span className="font-semibold text-[color:var(--foreground)]/80">{cur.title}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {tools.map((t) => (
            <a
              key={t.href}
              href={t.href}
              target={t.newTab ? "_blank" : undefined}
              rel={t.newTab ? "noopener noreferrer" : undefined}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                t.primary
                  ? "bg-[color:var(--primary)] text-white hover:scale-[1.03]"
                  : "border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--primary)] hover:border-[color:var(--accent)]"
              }`}
            >
              {t.label}
            </a>
          ))}
        </span>
        <span className="ms-auto flex items-center gap-2 text-[11px]">
          {next ? (
            <span className="text-[color:var(--primary)]/60">
              הבא: {KIND[next.kind].emoji} {KIND[next.kind].label} · {next.title}
            </span>
          ) : (
            <span className="text-[color:var(--primary)]/60">זה הבלוק האחרון</span>
          )}
          <button
            type="button"
            disabled={busy || plan.current === 0}
            onClick={() => act("prev")}
            className="rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-2.5 py-1 font-bold text-[color:var(--primary)] disabled:opacity-40"
          >
            → הקודם
          </button>
          {next ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act("next")}
              className="rounded-full bg-[color:var(--accent)] px-3 py-1 font-bold text-white disabled:opacity-40"
            >
              הבא ←
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => act("stop")}
              className="rounded-full bg-[color:var(--success)] px-3 py-1 font-bold text-white disabled:opacity-40"
            >
              ✓ סיום השיעור
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
