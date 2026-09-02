"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Teacher task management, kept deliberately small: one card with the due
// date, the re-assign list, and the "take off the class" button — plus a
// per-row unassign button for the roster table. Every destructive action
// confirms first, and says whether student work exists.

type Result = { ok: boolean; error?: string };

function toDateInput(unixSeconds: number): string {
  // The due date is stored as 23:59 Israel time; show the calendar day.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

export default function TaskAdminPanel({
  taskId,
  dueAt,
  assignedCount,
  hasWork,
  unassigned,
  updateDueDate,
  assignStudent,
  unpublishTask,
}: {
  taskId: number;
  dueAt: number;
  assignedCount: number;
  hasWork: boolean;
  unassigned: { id: number; fullName: string; klass: string | null }[];
  updateDueDate: (taskId: number, dueDate: string) => Promise<Result>;
  assignStudent: (taskId: number, userId: number) => Promise<Result>;
  unpublishTask: (taskId: number) => Promise<Result>;
}) {
  const router = useRouter();
  const [date, setDate] = useState(toDateInput(dueAt));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<Result>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? done : (r.error ?? "משהו השתבש."));
      if (r.ok) router.refresh();
    });

  const onUnpublish = () => {
    const warning = hasWork
      ? "לבטל את הפרסום של המשימה? תשומת לב: יש כבר תלמידים שהתחילו לעבוד עליה — התשובות שלהם יימחקו. המשימה תחזור לרשימת המשימות לפרסום."
      : "לבטל את הפרסום של המשימה? היא תיעלם מהכיתה ותחזור לרשימת המשימות לפרסום.";
    if (!window.confirm(warning)) return;
    start(async () => {
      const r = await unpublishTask(taskId);
      if (r.ok) router.push("/dashboard");
      else setMsg(r.error ?? "משהו השתבש.");
    });
  };

  return (
    <section className="mx-auto mb-8 max-w-3xl rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <h2 className="mb-3 font-display text-base font-bold text-[color:var(--primary)]">
        ⚙️ ניהול המשימה
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[color:var(--primary)]/70">
            תאריך אחרון להגשה
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending || date === toDateInput(dueAt)}
          onClick={() => run(() => updateDueDate(taskId, date), "תאריך ההגשה עודכן ✅")}
          className="rounded-full bg-[color:var(--primary)] px-5 py-2 text-sm font-bold text-white shadow transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
        >
          עדכון התאריך
        </button>

        <div className="ms-auto flex items-center gap-2">
          <span className="text-xs text-[color:var(--primary)]/55">
            מוקצה ל-{assignedCount} תלמידים
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={onUnpublish}
            className="rounded-full border border-[color:var(--danger)]/50 px-4 py-2 text-xs font-bold text-[color:var(--danger)] transition hover:bg-[color:var(--danger)]/5 disabled:opacity-40"
          >
            🗑️ ביטול הפרסום לכל הכיתה
          </button>
        </div>
      </div>

      {unassigned.length > 0 && (
        <div className="mt-4 border-t border-[color:var(--border)] pt-3">
          <p className="mb-2 text-xs font-semibold text-[color:var(--primary)]/70">
            לא מוקצים למשימה זו — לחיצה מקצה:
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => run(() => assignStudent(taskId, s.id), `${s.fullName} הוקצה/תה למשימה ✅`)}
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1 text-xs text-[color:var(--primary)] transition hover:border-[color:var(--accent)] disabled:opacity-40"
              >
                + {s.fullName}
                {s.klass && <span className="text-[color:var(--primary)]/50"> · {s.klass}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <p className="mt-3 text-xs font-semibold text-[color:var(--success)]">{msg}</p>
      )}
    </section>
  );
}

// Per-row "remove from this task" — inside the roster table.
export function UnassignButton({
  taskId,
  userId,
  name,
  hasWork,
  action,
}: {
  taskId: number;
  userId: number;
  name: string;
  hasWork: boolean;
  action: (taskId: number, userId: number) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onClick = () => {
    const warning = hasWork
      ? `לבטל את ההקצאה של ${name}? המשימה תיעלם מהרשימה שלו/ה. התשובות נשמרות, והקצאה מחדש תחזיר הכול.`
      : `לבטל את ההקצאה של ${name}? המשימה תיעלם מהרשימה שלו/ה (אפשר להקצות מחדש בכל עת).`;
    if (!window.confirm(warning)) return;
    start(async () => {
      const r = await action(taskId, userId);
      if (r.ok) router.refresh();
      else window.alert(r.error ?? "משהו השתבש.");
    });
  };
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      title="ביטול ההקצאה של המשימה לתלמיד/ה זה/ו"
      className="ms-2 rounded-lg px-2 py-1 text-[11px] text-[color:var(--danger)]/70 transition hover:bg-[color:var(--danger)]/5 hover:text-[color:var(--danger)] disabled:opacity-40"
    >
      ✕ ביטול הקצאה
    </button>
  );
}
