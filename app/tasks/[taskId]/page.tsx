import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import TopNav from "@/components/top-nav";
import ClassPulseDrawer from "@/components/class-pulse-drawer";
import LessonStrip from "@/components/lesson-strip";
import LessonFab from "@/components/lesson-fab";
import ReflectionDrawer from "@/components/reflection-drawer";
import TaskRunner from "@/components/task/task-runner";
import PrintLinks from "@/components/task/print-links";
import {
  getTask,
  isAssigned,
  ensureProgress,
  getProgress,
  getAnswers,
  getMarkings,
} from "@/lib/tasks";
import { getTaskContent, countTaskUnits, positionLabel } from "@/content/tasks/registry";
import { isStudentMode } from "@/lib/student-mode";
import { formatFullDate } from "@/lib/hebrew";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (!user.guest && !user.onboarded) redirect("/onboarding");

  const { taskId: raw } = await params;
  const taskId = Number(raw);
  const task = await getTask(taskId);
  if (!task) notFound();

  const userId = Number(user.id);
  const isTeacher = user.role === "teacher";
  const guest = Boolean(user.guest);

  if (!isTeacher && !guest && !(await isAssigned(taskId, userId))) {
    redirect("/tasks");
  }

  const baseReg = getTaskContent(task.content_ref);
  if (!baseReg) notFound();
  // file defaults + the teacher's in-place edits (hidden / reworded / added
  // questions); the teacher outside student mode also gets the editor
  const { getOverrides, applyOverrides, EMPTY_EDITS, EMPTY_UNIT } = await import("@/lib/content-overrides");
  const overrides = await getOverrides(baseReg.content.ref);
  const reg = { ...baseReg, content: applyOverrides(baseReg.content, overrides) };
  const studentMode = isTeacher ? await isStudentMode() : false;
  const canEditContent = isTeacher && !studentMode;
  const editable = canEditContent
    ? {
        edits: overrides.worksheet ?? EMPTY_EDITS,
        unit: overrides.unit ?? EMPTY_UNIT,
        original: baseReg.content.sections,
      }
    : null;

  // First open starts the work stopwatch (students only, not guests).
  if (!isTeacher && !guest) {
    await ensureProgress(taskId, userId);
  }
  const progress = guest ? null : await getProgress(taskId, userId);
  const answers = guest ? {} : await getAnswers(taskId, userId);
  const markings = guest ? [] : await getMarkings(taskId, userId);
  // Questions already banked for this task — the question stage acknowledges
  // them ("you already asked X on the way") instead of pretending it's empty.
  const { db } = await import("@/lib/db");
  const bankRows = guest
    ? { rows: [] as { question: unknown }[] }
    : await db().execute({
        sql: `SELECT question FROM question_bank WHERE user_id = ? AND task_id = ? ORDER BY created_at`,
        args: [userId, taskId],
      });
  const initialQuestions = bankRows.rows.map((r) => String(r.question));

  // focus counter continuity: exits already recorded in the current lesson
  // window (last 90 minutes), so a page refresh doesn't reset the counter
  let initialFocusExits = 0;
  if (!guest && !isTeacher) {
    const { ensureFocusTable } = await import("@/lib/tasks");
    await ensureFocusTable();
    const f = await db().execute({
      sql: `SELECT COUNT(*) AS n FROM focus_events
            WHERE task_id = ? AND user_id = ? AND kind = 'blur' AND created_at >= ?`,
      args: [taskId, userId, Math.floor(Date.now() / 1000) - 90 * 60],
    });
    initialFocusExits = Number(f.rows[0]?.n ?? 0);
  }


  return (
    <>
      <TopNav />
      {/* teacher tooling stays hidden in student mode — the whole point of
          that mode is experiencing the site exactly as a student does */}
      {canEditContent && <LessonStrip />}
      {canEditContent && <LessonFab />}
      {canEditContent && <ClassPulseDrawer taskId={taskId} />}
      {!guest && (
        <ReflectionDrawer
          taskId={taskId}
          contextRef={`${reg.content.bookRef} · ${reg.content.title}`}
          mode={canEditContent ? "teacher" : "student"}
        />
      )}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 text-center">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.25em] text-[color:var(--accent)]">
            {reg.content.bookRef}
          </p>
          {positionLabel(task.content_ref) && (
            <p className="mb-1 text-xs font-bold text-[color:var(--primary)]/60">
              {positionLabel(task.content_ref)}
            </p>
          )}
          <h1 className="font-display text-3xl font-extrabold text-[color:var(--primary)] sm:text-4xl">
            {reg.content.title}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--foreground)]/65">
            🎯 מיומנויות מרכזיות: {reg.content.skill}
          </p>
          <p className="mt-1 text-xs text-[color:var(--primary)]/55">
            📅 להגשה עד: {formatFullDate(task.due_at)}
          </p>
          <p className="mt-2">
            <PrintLinks contentRef={task.content_ref} />
          </p>
        </div>

        <TaskRunner
          taskId={taskId}
          studentName={user.fullName ?? null}
          content={reg.content}
          mainPassage={reg.mainPassage}
          initialAnswers={answers}
          initialMarkings={markings}
          initialQuestions={initialQuestions}
          canReset={isTeacher}
          initialStage={progress?.stage ?? 1}
          initialWorkSeconds={progress?.work_seconds ?? 0}
          submitted={Boolean(progress?.submitted_at)}
          initialFocusExits={initialFocusExits}
          dueAt={task.due_at}
          totalUnits={countTaskUnits(reg)}
          editable={editable}
        />
      </main>
    </>
  );
}
