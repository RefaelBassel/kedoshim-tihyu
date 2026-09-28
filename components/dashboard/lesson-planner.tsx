"use client";

import { useEffect, useState } from "react";
import type { LessonPlan, PlanBlock, BlockKind, UnitOverview } from "@/lib/lesson-plan";

// מהלך השיעור — ONE screen. Top: today's lesson as a row of chips (added
// with one tap from the journey below, reordered with arrows) and ▶.
// Below: the journey — every unit in curriculum order, with what happened
// to it at a glance (published? how many completed? debated?) and the
// three tools right on the row. No pickers, no intermediate pages; a new
// window opens only for what physically belongs on the projector.
const KIND: Record<BlockKind, { emoji: string; label: string; minutes: string }> = {
  review: { emoji: "🔁", label: "חזרה", minutes: "5" },
  discussion: { emoji: "💬", label: "דיון", minutes: "15" },
  study: { emoji: "📖", label: "לימוד", minutes: "20" },
};

export default function LessonPlanner() {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [units, setUnits] = useState<UnitOverview[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const apply = (d: { ok?: boolean; plan?: LessonPlan; units?: UnitOverview[] }) => {
    if (!d.ok) return;
    if (d.plan) setPlan(d.plan);
    if (d.units) setUnits(d.units);
  };
  const load = () =>
    fetch("/api/lesson-plan", { cache: "no-store" }).then((r) => r.json()).then(apply).catch(() => {});
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const persist = async (blocks: PlanBlock[], msg = "נשמר ✓") => {
    setBusy(true);
    try {
      const r = await fetch("/api/lesson-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      apply(await r.json());
      setFlash(msg);
      setTimeout(() => setFlash(null), 1400);
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
      apply(await r.json());
    } finally {
      setBusy(false);
    }
  };

  if (!plan) {
    return <p className="p-6 text-center text-sm text-[color:var(--primary)]/60">טוען את מהלך השיעור...</p>;
  }

  const blocks = plan.blocks;
  const started = plan.current >= 0;
  const addBlock = (kind: BlockKind, u: UnitOverview) => {
    if (u.taskId == null) return;
    void persist([...blocks, { kind, taskId: u.taskId, title: u.title }], `נוסף לשיעור של היום: ${KIND[kind].emoji} ${KIND[kind].label}`);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const copy = [...blocks];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    void persist(copy);
  };
  const totalMin = blocks.reduce((n, b) => n + Number(KIND[b.kind].minutes), 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* ===== today ===== */}
      <section className="rounded-2xl border-2 border-[color:var(--accent)]/60 bg-[color:var(--card)] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">
            📅 השיעור של היום
            {blocks.length > 0 && (
              <span className="ms-2 text-sm font-semibold text-[color:var(--primary)]/55">~{totalMin} דק׳</span>
            )}
          </p>
          <span className="text-xs font-bold text-[color:var(--success)]">{flash ?? ""}</span>
        </div>

        {blocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[color:var(--border)] px-4 py-3 text-sm text-[color:var(--primary)]/60">
            עוד ריק. למטה, ליד כל יחידה, לוחצים 🔁 / 💬 / 📖 — והחלק נכנס לכאן. אפשר להוסיף שני דיונים,
            ולסדר בחצים.
          </p>
        ) : (
          <ol className="flex flex-wrap items-center gap-2">
            {blocks.map((b, i) => {
              const k = KIND[b.kind];
              const isNow = plan.current === i;
              const done = plan.current > i;
              return (
                <li
                  key={`${b.kind}-${b.taskId}-${i}`}
                  className={`flex items-center gap-1.5 rounded-full border py-1 pe-1 ps-3 text-sm ${
                    isNow
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white shadow"
                      : done
                        ? "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--primary)]/50 line-through"
                        : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--primary)]"
                  }`}
                  title={b.title}
                >
                  <span className="font-bold">
                    {i + 1}. {k.emoji} {k.label}
                  </span>
                  <span className={`max-w-[150px] truncate text-xs ${isNow ? "text-white/85" : "opacity-70"}`}>
                    {shortTitle(b.title)}
                  </span>
                  {!started && (
                    <span className="flex items-center">
                      <Tiny onClick={() => move(i, -1)} disabled={busy || i === 0} title="שמאלה">→</Tiny>
                      <Tiny onClick={() => move(i, 1)} disabled={busy || i === blocks.length - 1} title="ימינה">←</Tiny>
                      <Tiny onClick={() => void persist(blocks.filter((_, x) => x !== i), "הוסר")} disabled={busy} title="להסיר" danger>✕</Tiny>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
              <span className="text-xs font-bold text-[color:var(--primary)]/70">
                השיעור רץ — הרצועה בראש כל עמוד מלווה אותך.
              </span>
              <button type="button" disabled={busy || plan.current === 0} onClick={() => act("prev")} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)] disabled:opacity-40">→ הקודם</button>
              <button type="button" disabled={busy || plan.current >= blocks.length - 1} onClick={() => act("next")} className="rounded-full bg-[color:var(--primary)] px-4 py-1 text-xs font-bold text-white disabled:opacity-40">הבא ←</button>
              <button type="button" disabled={busy} onClick={() => act("stop")} className="text-xs font-semibold text-[color:var(--primary)]/55 hover:text-[color:var(--danger)]">סיום השיעור</button>
            </>
          )}
          {blocks.length > 0 && !started && (
            <button type="button" disabled={busy} onClick={() => void persist([], "נוקה")} className="ms-auto text-[11px] font-semibold text-[color:var(--primary)]/45 hover:text-[color:var(--danger)]">
              לנקות
            </button>
          )}
        </div>
      </section>

      {/* ===== the journey ===== */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">🗺️ המסע — כל היחידות</p>
          <p className="text-[11px] text-[color:var(--primary)]/55">
            <span className="me-3">✅ נלמדה</span>
            <span className="me-3">💬 נדונה</span>
            <span>⬜ עוד לא</span>
          </p>
        </div>
        <ol className="space-y-2">
          {units.map((u, i) => {
            const published = u.taskId != null;
            const pct = u.assigned ? Math.round((100 * u.complete) / u.assigned) : 0;
            const learned = published && u.assigned > 0 && u.complete >= Math.ceil(u.assigned * 0.6);
            const discussed = u.discussed > 0;
            const inPlan = blocks.filter((b) => b.taskId === u.taskId).map((b) => KIND[b.kind].emoji);
            return (
              <li
                key={u.ref}
                className={`rounded-2xl border bg-[color:var(--card)] p-3 sm:p-4 ${
                  published ? "border-[color:var(--border)]" : "border-dashed border-[color:var(--border)] opacity-70"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  {/* status dots */}
                  <span className="flex shrink-0 items-center gap-1" title="נלמדה · נדונה">
                    <Dot on={learned} kind="learned" partial={published && !learned && u.complete > 0} />
                    <Dot on={discussed} kind="discussed" partial={!discussed && u.discussionOpen} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-[color:var(--primary)]">
                      <span className="me-1 text-[color:var(--accent)]">{i + 1}.</span>
                      {u.title}
                    </p>
                    <p className="text-[11px] text-[color:var(--primary)]/55">
                      {u.position ?? u.ref}
                      {published ? (
                        <>
                          {" · "}
                          <b className={pct === 100 ? "text-[color:var(--success)]" : ""}>
                            {u.complete}/{u.assigned} סיימו ({pct}%)
                          </b>
                          {discussed && ` · נדונה ${u.discussed === 1 ? "פעם אחת" : `${u.discussed} פעמים`}`}
                          {!discussed && u.discussionOpen && " · דיון פתוח"}
                        </>
                      ) : (
                        " · עוד לא פורסמה — מפרסמים בדשבורד"
                      )}
                      {inPlan.length > 0 && ` · היום: ${inPlan.join(" ")}`}
                    </p>
                  </div>
                  {/* the three tools, right here */}
                  {published && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Tool kind="review" onAdd={() => addBlock("review", u)} href={`/dashboard/review/${u.taskId}`} newTab disabled={busy} />
                      <Tool kind="discussion" onAdd={() => addBlock("discussion", u)} href={`/dashboard/discussion/${u.taskId}/control`} disabled={busy} secondHref={`/dashboard/discussion/${u.taskId}/board`} />
                      <Tool kind="study" onAdd={() => addBlock("study", u)} href={`/tasks/${u.taskId}`} disabled={busy} secondHref={`/dashboard/class-board/${u.taskId}`} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[11px] leading-5 text-[color:var(--primary)]/50">
          ✅ "נלמדה" = לפחות 60% מהכיתה ענו על כל השאלות. 💬 "נדונה" = התקיים דיון שנסגר. הכפתור השמאלי
          בכל כלי מוסיף אותו לשיעור של היום; הכפתור הימני פותח אותו מיד.
        </p>
      </section>
    </div>
  );
}

function shortTitle(t: string) {
  return t.length > 28 ? t.slice(0, 26) + "…" : t;
}

function Dot({ on, kind, partial }: { on: boolean; kind: "learned" | "discussed"; partial?: boolean }) {
  const color = kind === "learned" ? "var(--success)" : "var(--primary)";
  const glyph = kind === "learned" ? "✅" : "💬";
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
      style={{
        background: on ? `color-mix(in srgb, ${color} 18%, transparent)` : partial ? `color-mix(in srgb, var(--warning) 18%, transparent)` : "var(--background)",
        opacity: on || partial ? 1 : 0.35,
        border: `1px solid ${on ? color : "var(--border)"}`,
      }}
      title={kind === "learned" ? (on ? "נלמדה" : partial ? "בתהליך" : "עוד לא נלמדה") : on ? "נדונה" : partial ? "דיון פתוח" : "עוד לא נדונה"}
    >
      {on || partial ? glyph : "⬜"}
    </span>
  );
}

// A tool on a unit row: [ + add to today ] [ open now ] (+ optional second
// link for the projector window).
function Tool({
  kind,
  onAdd,
  href,
  secondHref,
  newTab,
  disabled,
}: {
  kind: BlockKind;
  onAdd: () => void;
  href: string;
  secondHref?: string;
  newTab?: boolean;
  disabled?: boolean;
}) {
  const k = KIND[kind];
  const tone =
    kind === "discussion"
      ? "border-[color:var(--accent)]/60 text-[color:var(--accent)]"
      : "border-[color:var(--border)] text-[color:var(--primary)]";
  return (
    <span className={`inline-flex items-stretch overflow-hidden rounded-full border text-[11px] font-bold ${tone}`}>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        title={`להוסיף ${k.label} על היחידה הזו לשיעור של היום`}
        className="px-2.5 py-1 transition hover:bg-[color:var(--background)] disabled:opacity-40"
      >
        + {k.emoji}
      </button>
      <a
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        title={`לפתוח ${k.label} עכשיו`}
        className="border-s border-current/30 px-2.5 py-1 transition hover:bg-[color:var(--background)]"
      >
        {k.label}
      </a>
      {secondHref && (
        <a
          href={secondHref}
          target="_blank"
          rel="noopener noreferrer"
          title="לפרוייקטור (חלון חדש)"
          className="border-s border-current/30 px-2 py-1 transition hover:bg-[color:var(--background)]"
        >
          🖥️
        </a>
      )}
    </span>
  );
}

function Tiny({
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
      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition disabled:opacity-30 ${
        danger ? "text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10" : "hover:bg-[color:var(--card)]"
      }`}
    >
      {children}
    </button>
  );
}
