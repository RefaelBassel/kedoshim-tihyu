import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import {
  tasksForStudent,
  allTasksWithStats,
  STATUS_META,
} from "@/lib/tasks";
import { sweepOverdue } from "@/lib/notify";
import { isStudentMode } from "@/lib/student-mode";
import { formatHebDate, formatHebDateTime, formatWorkTime } from "@/lib/hebrew";
import { prepCardsFor } from "@/lib/exam-prep";
import { countdownText, daysUntil } from "@/lib/prep-shared";
import { formatExamDate } from "@/lib/exam-export-shared";

export default async function TasksPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  const studentMode = user.role === "teacher" && (await isStudentMode());
  const isTeacher = user.role === "teacher" && !studentMode;

  try {
    await sweepOverdue();
  } catch {
    // DB not ready — page still renders
  }

  return (
    <PageShell
      title="משימות שוטפות"
      subtitle={
        isTeacher
          ? "כל המשימות — עם תאריכי פרסום, הגשה ומעקב הגשות"
          : "משימות הלמידה שהוקצו לך — מה בלימוד, מה הוגש, ומה ממתין"
      }
    >
      {isTeacher ? (
        <TeacherView />
      ) : (
        <StudentView userId={Number(user.id)} allPublished={studentMode} />
      )}
    </PageShell>
  );
}

async function StudentView({
  userId,
  allPublished,
}: {
  userId: number;
  allPublished?: boolean;
}) {
  let tasks: Awaited<ReturnType<typeof tasksForStudent>> = [];
  let preps: Awaited<ReturnType<typeof prepCardsFor>> = [];
  try {
    tasks = await tasksForStudent(userId, allPublished);
    preps = await prepCardsFor(userId);
  } catch {
    // guest/no DB
  }

  const prepCards = preps.map((p) => <PrepCard key={`prep-${p.id}`} card={p} />);

  if (tasks.length === 0 && prepCards.length > 0) {
    return <div className="grid gap-5 sm:grid-cols-2">{prepCards}</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-[color:var(--accent)]/40 bg-[color:var(--card)]/70 px-8 py-12 text-center">
        <p className="text-3xl">🌱</p>
        <p className="mt-2 font-display text-lg font-bold text-[color:var(--primary)]">
          עדיין לא הוקצו לכם משימות
        </p>
        <p className="mt-1 text-sm text-[color:var(--foreground)]/60">
          כשהמורה תפרסם משימה — היא תופיע כאן ותגיע הודעה.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <p className="col-span-full -mb-1 text-center text-sm text-[color:var(--primary)]/60">
        בהצלחה בעבודה! 🌱
      </p>
      {prepCards}
      {tasks.map((t) => {
        const meta = STATUS_META[t.status];
        return (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="group block rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm transition hover:border-[color:var(--accent)]/60 hover:shadow-md"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="rounded-full px-3 py-1 text-[11px] font-bold"
                style={{ background: meta.bg, color: meta.color }}
              >
                {meta.label}
              </span>
              {t.score != null && (
                <span className="rounded-full bg-[color:var(--success)]/15 px-3 py-1 text-[11px] font-bold text-[color:var(--success)]">
                  ציון: {t.score}
                </span>
              )}
            </div>
            {t.position && (
              <p className="mb-1 text-[11px] font-bold tracking-wide text-[color:var(--accent)]">
                {t.position.unit} · משימה {t.position.order} מתוך {t.position.total}
              </p>
            )}
            <h2 className="font-display text-lg font-bold leading-snug text-[color:var(--primary)]">
              {t.title}
            </h2>
            <p className="mt-1 text-xs text-[color:var(--primary)]/55">
              📅 להגשה עד {formatHebDateTime(t.dueAt)}
              {t.workSeconds > 0 && <> · ⏱ עבדת {formatWorkTime(t.workSeconds)}</>}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--border)]/50">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-[color:var(--accent)] to-[color:var(--primary)]"
                  style={{ width: `${t.progressPct}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-[color:var(--primary)]/70">
                {t.progressPct}%
              </span>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--accent)]">
              <span>
                {t.status === "not_started"
                  ? "מתחילים"
                  : t.status === "submitted" && Date.now() / 1000 <= t.dueAt
                    ? "הוגשה · אפשר לבטל הגשה ולתקן עד המועד"
                    : t.status === "submitted" || t.status === "graded"
                      ? "לצפייה"
                      : "ממשיכים"}
              </span>
              <span aria-hidden className="transition group-hover:-translate-x-0.5">←</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// A published exam preparation: a card of its own, wide, with the countdown
// to the exam and the student's progress.
function PrepCard({ card }: { card: Awaited<ReturnType<typeof prepCardsFor>>[number] }) {
  const countdown = countdownText(daysUntil(card.examDate));
  const pct = card.total ? Math.round((100 * card.done) / card.total) : 0;
  return (
    <Link
      href={`/exams#prep-${card.id}`}
      className="group col-span-full block rounded-2xl border-2 border-[color:var(--accent)] p-5 shadow-md transition hover:shadow-lg"
      style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--card)), var(--card))" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-[color:var(--accent)] px-3 py-1 text-[11px] font-extrabold text-white">📚 הכנה למבחן</span>
        {countdown && <span className="font-display text-lg font-extrabold text-[color:var(--accent)]">⏳ {countdown}</span>}
      </div>
      <h2 className="mt-2 font-display text-xl font-extrabold text-[color:var(--primary)]">{card.title}</h2>
      {card.examDate && <p className="mt-0.5 text-xs text-[color:var(--primary)]/60">📅 המבחן ב-{formatExamDate(card.examDate)}</p>}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--border)]/60">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: card.ready ? "var(--success)" : "linear-gradient(90deg, var(--accent), var(--primary))" }} />
        </div>
        <span className="text-xs font-bold text-[color:var(--primary)]/70">
          {card.ready ? "🏅 הושלם" : `השלמת ${card.done} מתוך ${card.total}`}
        </span>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--accent)]">
        {card.done === 0 ? "מתחילים להתכונן" : card.ready ? "לחזור על החומר" : "ממשיכים להתכונן"}
        <span aria-hidden className="transition group-hover:-translate-x-0.5">←</span>
      </span>
    </Link>
  );
}

async function TeacherView() {
  let tasks: Awaited<ReturnType<typeof allTasksWithStats>> = [];
  try {
    tasks = await allTasksWithStats();
  } catch {
    // no DB
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)] px-6 py-2.5 text-sm font-bold text-white shadow transition hover:scale-[1.02]"
        >
          + פרסום משימה חדשה (בדשבורד)
        </Link>
      </div>
      {tasks.length === 0 ? (
        <p className="text-center text-sm text-[color:var(--foreground)]/60">
          עדיין לא פורסמו משימות.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/task/${t.id}`}
              className="group block rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm transition hover:border-[color:var(--accent)]/60 hover:shadow-md"
            >
              {t.position && (
                <p className="mb-1 text-[11px] font-bold tracking-wide text-[color:var(--accent)]">
                  {t.position.unit} · משימה {t.position.order} מתוך {t.position.total}
                </p>
              )}
              <h2 className="font-display text-lg font-bold text-[color:var(--primary)]">
                {t.title}
              </h2>
              <p className="mt-1 text-xs text-[color:var(--primary)]/55">
                📅 פורסמה {formatHebDate(t.publishedAt)} · להגשה עד {formatHebDateTime(t.dueAt)}
              </p>
              <div className="mt-3 flex gap-2 text-[11px] font-bold">
                <span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-[color:var(--primary)]">
                  👥 {t.assigned} הוקצו
                </span>
                <span className="rounded-full bg-[#e3edf7] px-3 py-1 text-[#2f5d8a]">
                  📬 {t.submitted} הוגשו
                </span>
                <span className="rounded-full bg-[color:var(--success)]/15 px-3 py-1 text-[color:var(--success)]">
                  ✅ {t.graded} נבדקו
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
