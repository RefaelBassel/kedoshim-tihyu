"use client";

import { useEffect, useState } from "react";
import type { LessonPlan, PlanBlock, BlockKind } from "@/lib/lesson-plan";

// מתכנן השיעור — the teacher composes today's lesson from three kinds of
// blocks in two taps each, reorders with arrows, removes with ✕, and
// presses ▶. Two debates? Tap "+ דיון" twice. The strip then guides her
// through the blocks on every page.
interface TaskOpt {
  id: number;
  ref: string;
  title: string;
  position: string | null;
}

const KIND: Record<BlockKind, { emoji: string; label: string; minutes: string; hint: string }> = {
  review: { emoji: "🔁", label: "חזרה", minutes: "~5 דק׳", hint: "מצגת תמציתית על היחידה" },
  discussion: { emoji: "💬", label: "דיון", minutes: "~15 דק׳", hint: "דיבייט על שאלת היחידה — למי שסיימו אותה" },
  study: { emoji: "📖", label: "לימוד", minutes: "~20 דק׳", hint: "היחידה באתר" },
};

export default function LessonPlanner() {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [tasks, setTasks] = useState<TaskOpt[]>([]);
  const [picking, setPicking] = useState<BlockKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = () =>
    fetch("/api/lesson-plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setPlan(d.plan);
          setTasks(d.tasks);
        }
      })
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const persist = async (blocks: PlanBlock[]) => {
    setBusy(true);
    try {
      const r = await fetch("/api/lesson-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const d = await r.json();
      if (d.ok) {
        setPlan(d.plan);
        setSaved("נשמר ✓");
        setTimeout(() => setSaved(null), 1500);
      }
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const r = await fetch("/api/lesson-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json();
      if (d.ok) setPlan(d.plan);
    } finally {
      setBusy(false);
    }
  };

  if (!plan) {
    return (
      <section className="mx-auto mb-8 max-w-3xl rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 text-sm text-[color:var(--primary)]/60">
        טוען את מתכנן השיעור...
      </section>
    );
  }

  const blocks = plan.blocks;
  // sensible defaults for the picker: debate/review on the unit BEFORE the
  // newest published one, study on the newest
  const newest = tasks[tasks.length - 1];
  const previous = tasks.length > 1 ? tasks[tasks.length - 2] : newest;
  const suggested = (kind: BlockKind) => (kind === "study" ? newest : previous);

  const add = (kind: BlockKind, t: TaskOpt) => {
    setPicking(null);
    void persist([...blocks, { kind, taskId: t.id, title: t.title }]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const copy = [...blocks];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    void persist(copy);
  };
  const remove = (i: number) => void persist(blocks.filter((_, k) => k !== i));
  const started = plan.current >= 0;

  return (
    <section className="mx-auto mb-8 max-w-3xl rounded-2xl border-2 border-[color:var(--accent)]/50 bg-[color:var(--card)] p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">
            🧭 השיעור של היום
          </p>
          <p className="text-xs text-[color:var(--foreground)]/60">
            מרכיבים את השיעור מבלוקים — בסדר שאת בוחרת. שעתיים? שני דיונים. ואז ▶ — ורצועה
            בראש כל עמוד תגיד מה עכשיו ומה הבא, עם הכלי הנכון בלחיצה.
          </p>
        </div>
        {saved && <span className="text-xs font-bold text-[color:var(--success)]">{saved}</span>}
      </div>

      {/* the plan */}
      {blocks.length === 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-[color:var(--border)] px-4 py-3 text-center text-sm text-[color:var(--primary)]/55">
          עוד אין בלוקים — הוסיפי למטה.
        </p>
      ) : (
        <ol className="mb-3 space-y-2">
          {blocks.map((b, i) => {
            const k = KIND[b.kind];
            const isNow = plan.current === i;
            const done = plan.current > i;
            return (
              <li
                key={`${b.kind}-${b.taskId}-${i}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                  isNow
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/8"
                    : done
                      ? "border-[color:var(--border)] bg-[color:var(--background)] opacity-60"
                      : "border-[color:var(--border)] bg-[color:var(--background)]"
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)] font-display text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[color:var(--primary)]">
                    {k.emoji} {k.label} · <span className="font-semibold text-[color:var(--foreground)]/80">{b.title}</span>
                  </p>
                  <p className="text-[10px] text-[color:var(--primary)]/55">
                    {k.minutes} · {k.hint}
                    {isNow && " · ▶ עכשיו"}
                    {done && " · ✓ הסתיים"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Mini onClick={() => move(i, -1)} disabled={busy || i === 0} title="להעלות">↑</Mini>
                  <Mini onClick={() => move(i, 1)} disabled={busy || i === blocks.length - 1} title="להוריד">↓</Mini>
                  <Mini onClick={() => remove(i)} disabled={busy} title="להסיר" danger>✕</Mini>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* add a block */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(KIND) as BlockKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={busy || tasks.length === 0}
            onClick={() => setPicking((p) => (p === kind ? null : kind))}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
              picking === kind
                ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                : "border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--primary)] hover:border-[color:var(--accent)]"
            } disabled:opacity-40`}
          >
            + {KIND[kind].emoji} {KIND[kind].label}
          </button>
        ))}
        {tasks.length === 0 && (
          <span className="text-xs text-[color:var(--warning)]">אין עדיין משימות שפורסמו.</span>
        )}
      </div>
      {picking && (
        <div className="mt-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3">
          <p className="mb-2 text-[11px] font-bold text-[color:var(--primary)]/60">
            {KIND[picking].emoji} {KIND[picking].label} — על איזו יחידה?
          </p>
          <div className="flex flex-wrap gap-2">
            {tasks.map((t) => {
              const isDefault = suggested(picking)?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => add(picking, t)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition hover:border-[color:var(--accent)] ${
                    isDefault
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--primary)]"
                      : "border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--primary)]/80"
                  }`}
                  title={t.title}
                >
                  {t.position ?? t.title}
                  {isDefault && " · מומלץ"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* run */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-3">
        {!started ? (
          <button
            type="button"
            disabled={busy || blocks.length === 0}
            onClick={() => act("start")}
            className="rounded-full bg-[color:var(--accent)] px-6 py-2 text-sm font-bold text-white shadow transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
          >
            ▶ להתחיל את השיעור
          </button>
        ) : (
          <>
            <button type="button" disabled={busy || plan.current === 0} onClick={() => act("prev")} className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-bold text-[color:var(--primary)] disabled:opacity-40">
              → הקודם
            </button>
            <button type="button" disabled={busy || plan.current >= blocks.length - 1} onClick={() => act("next")} className="rounded-full bg-[color:var(--primary)] px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
              הבא ←
            </button>
            <button type="button" disabled={busy} onClick={() => act("stop")} className="text-xs font-semibold text-[color:var(--primary)]/55 hover:text-[color:var(--danger)]">
              סיום השיעור
            </button>
          </>
        )}
        <span className="ms-auto text-[11px] text-[color:var(--primary)]/45">התוכנית נשמרת לבד · {plan.day}</span>
      </div>
    </section>
  );
}

function Mini({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs transition disabled:opacity-30 ${
        danger
          ? "border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
          : "border-[color:var(--border)] text-[color:var(--primary)]/70 hover:border-[color:var(--accent)]"
      }`}
    >
      {children}
    </button>
  );
}
