import Link from "next/link";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import PageShell from "@/components/page-shell";
import ClassPulseDrawer from "@/components/class-pulse-drawer";
import TaskAdminPanel, { UnassignButton } from "@/components/dashboard/task-admin";
import LessonFlow from "@/components/dashboard/lesson-flow";
import PrintLinks from "@/components/task/print-links";
import { getTask, taskRoster, unassignedStudents, STATUS_META, isTaskCancelled } from "@/lib/tasks";
import { positionLabel, taskOrderIndex } from "@/content/tasks/registry";
import { formatHebDateTime, formatWorkTime } from "@/lib/hebrew";
import {
  updateDueDate,
  unassignStudent,
  assignStudent,
  unpublishTask,
  republishTaskAction,
} from "./actions";

// Teacher view of one task: full roster, color-coded statuses (including
// טרם נלמדה), work time, progress, and links into each submission.
export default async function DashboardTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");

  const { taskId: raw } = await params;
  const taskId = Number(raw);
  const task = await getTask(taskId);
  if (!task) notFound();

  const roster = await taskRoster(taskId);
  const unassigned = await unassignedStudents(taskId);
  const hasWork = roster.some((r) => r.status !== "not_started" || r.workSeconds > 0);
  const groups = {
    submitted: roster.filter((r) => r.status === "submitted"),
    graded: roster.filter((r) => r.status === "graded"),
    in_progress: roster.filter((r) => r.status === "in_progress"),
    overdue: roster.filter((r) => r.status === "overdue"),
    not_started: roster.filter((r) => r.status === "not_started"),
  };

  const cancelled = await isTaskCancelled(task.id);
  // the previous unit in curriculum order (among published tasks) — its
  // question is what this lesson's debate is about
  const { db } = await import("@/lib/db");
  const allTasks = await db().execute({ sql: "SELECT id, content_ref, title FROM tasks", args: [] });
  const ordered = allTasks.rows
    .map((r) => ({ id: Number(r.id), ref: String(r.content_ref), title: String(r.title) }))
    .sort((a, b) => taskOrderIndex(a.ref) - taskOrderIndex(b.ref));
  const idx = ordered.findIndex((t) => t.id === task.id);
  const prev = idx > 0 ? ordered[idx - 1] : null;

  return (
    <PageShell
      title={task.title}
      subtitle={`${positionLabel(task.content_ref) ? positionLabel(task.content_ref) + " · " : ""}להגשה עד ${formatHebDateTime(task.due_at)} · ${roster.length} מוקצים`}
    >
      <ClassPulseDrawer taskId={task.id} />
      <LessonFlow taskId={task.id} prevTaskId={prev?.id ?? null} prevTitle={prev?.title ?? null} />
      {cancelled && (
        <div className="mx-auto mb-4 max-w-3xl rounded-2xl border-2 border-[color:var(--danger)]/40 bg-[color:var(--danger)]/5 px-5 py-3 text-sm">
          <b className="text-[color:var(--danger)]">🚫 המשימה מבוטלת</b> — התלמידים לא רואים
          אותה; כל העבודה שנשמרה נשארה. ״פרסום מחדש״ מחזיר אותה לכולם.
        </div>
      )}
      <TaskAdminPanel
        taskId={task.id}
        dueAt={task.due_at}
        assignedCount={roster.length}
        hasWork={hasWork}
        unassigned={unassigned}
        updateDueDate={updateDueDate}
        assignStudent={assignStudent}
        unpublishTask={unpublishTask}
        republishTask={republishTaskAction}
        cancelled={cancelled}
      />
      <p className="mb-6 flex items-center justify-center gap-5 text-center">
        <Link
          href={`/tasks/${taskId}`}
          className="text-sm font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
        >
          👀 צפייה במשימה כפי שהכיתה רואה אותה ←
        </Link>
        <Link
          href={`/dashboard/class-board/${taskId}`}
          target="_blank"
          className="rounded-full bg-[color:var(--primary)] px-4 py-1.5 text-sm font-bold text-white shadow transition hover:scale-[1.02]"
        >
          🖥️ לוח כיתה להקרנה
        </Link>
        <PrintLinks contentRef={task.content_ref} />
      </p>

      {(
        [
          ["submitted", "📬 הוגשו — ממתינות לבדיקה"],
          ["graded", "✅ נבדקו ואושרו"],
          ["overdue", "⏰ עבר זמנן ולא הוגשו"],
          ["in_progress", "✏️ בלימוד"],
          ["not_started", "🌱 טרם נלמדו"],
        ] as const
      ).map(([key, heading]) =>
        groups[key].length === 0 ? null : (
          <section key={key} className="mb-8">
            <h2 className="mb-3 font-display text-base font-bold text-[color:var(--primary)]">
              {heading} ({groups[key].length})
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-right text-[11px] text-[color:var(--primary)]/60">
                    <th className="px-4 py-2.5 font-semibold">תלמיד/ה</th>
                    <th className="px-4 py-2.5 font-semibold">כיתה</th>
                    <th className="px-4 py-2.5 font-semibold">סטטוס</th>
                    <th className="px-4 py-2.5 font-semibold">התקדמות</th>
                    <th className="px-4 py-2.5 font-semibold">זמן עבודה</th>
                    <th className="px-4 py-2.5 font-semibold">ציון</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {groups[key].map((r) => {
                    const meta = STATUS_META[r.status];
                    return (
                      <tr
                        key={r.userId}
                        className="border-b border-[color:var(--border)]/50 last:border-0"
                      >
                        <td className="px-4 py-2.5 font-semibold text-[color:var(--primary)]">
                          {r.fullName}
                        </td>
                        <td className="px-4 py-2.5 text-[color:var(--primary)]/70">
                          {r.klass ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[color:var(--border)]/60">
                              <div
                                className="h-full rounded-full bg-[color:var(--accent)]"
                                style={{ width: `${r.progressPct}%` }}
                              />
                            </div>
                            <span className="text-[11px]">{r.progressPct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-[color:var(--primary)]/70">
                          {r.workSeconds > 0 ? formatWorkTime(r.workSeconds) : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-[color:var(--primary)]">
                          {r.score ?? (r.claudeScore != null ? `(${r.claudeScore})` : "—")}
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/dashboard/submission/${taskId}/${r.userId}`}
                            className="rounded-lg border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)] transition hover:border-[color:var(--accent)]"
                          >
                            {r.status === "submitted" ? "לבדיקה ✨" : "צפייה"}
                          </Link>
                          <UnassignButton
                            taskId={taskId}
                            userId={r.userId}
                            name={r.fullName}
                            hasWork={r.status !== "not_started" || r.workSeconds > 0}
                            action={unassignStudent}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}
    </PageShell>
  );
}
