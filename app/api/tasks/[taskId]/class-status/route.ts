import { typingStatsFor, EMPTY_TYPING, typedShare } from "@/lib/typing-guard";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/api-auth";
import { getTask, now, focusStatsFor } from "@/lib/tasks";
import {
  getTaskContent,
  countTaskUnits,
  stagesFor,
  stagesDone,
} from "@/content/tasks/registry";
import type { QuestionBlock } from "@/content/tasks/types";

// Live class status for one task — teacher only. Every question weighs the
// same: Part-A stages (7 in full tasks, 1 in simple ones) + comprehension
// answers + every Part-B answer field.
// Presence comes from the work-stopwatch heartbeat (task_progress.updated_at,
// beaten every ~20s while the student's window is visible).
const ACTIVE_WINDOW = 120; // seconds since last heartbeat = "in class, working"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { taskId: raw } = await params;
  const task = await getTask(Number(raw));
  if (!task) {
    return NextResponse.json({ error: "המשימה לא נמצאה." }, { status: 404 });
  }
  const baseReg = getTaskContent(task.content_ref);
  if (!baseReg) {
    return NextResponse.json({ error: "תוכן המשימה לא נמצא." }, { status: 404 });
  }
  // the worksheet as the class actually sees it (teacher edits applied)
  const { effectiveContent } = await import("@/lib/content-overrides");
  const reg = { ...baseReg, content: await effectiveContent(baseReg.content) };

  // the equal-weight unit list, in reading order
  const units: { key: string; label: string; part: "a" | "b" }[] = [];
  for (const s of stagesFor(reg.content)) {
    units.push({ key: `stage:${s.n}`, label: s.title, part: "a" });
  }
  for (const c of reg.content.comprehension ?? []) {
    units.push({ key: `comp:${c.key}`, label: "בדיקת הבנה", part: "a" });
  }
  for (const sec of reg.content.sections) {
    for (const b of sec.blocks) {
      if (b.type !== "question") continue;
      const q = b as QuestionBlock;
      if (q.fields?.length) {
        for (const f of q.fields) {
          units.push({ key: `${q.key}:${f.key}`, label: q.label, part: "b" });
        }
      } else {
        units.push({ key: q.key, label: q.label, part: "b" });
      }
    }
  }
  const answerKeys = new Set(
    units.filter((u) => !u.key.startsWith("stage:")).map((u) => u.key)
  );

  const roster = await db().execute({
    sql: `SELECT u.id, u.full_name, u.email, u.class,
                 p.stage, p.submitted_at, p.updated_at, p.work_seconds, p.opened_at
          FROM task_assignments a
          JOIN users u ON u.id = a.user_id
          LEFT JOIN task_progress p ON p.task_id = a.task_id AND p.user_id = a.user_id
          WHERE a.task_id = ?
          ORDER BY u.full_name`,
    args: [task.id],
  });
  const answers = await db().execute({
    sql: `SELECT user_id, question_key FROM task_answers
          WHERE task_id = ? AND TRIM(answer) <> ''`,
    args: [task.id],
  });
  const answeredBy = new Map<number, Set<string>>();
  for (const r of answers.rows) {
    const uid = Number(r.user_id);
    const key = String(r.question_key);
    if (!answerKeys.has(key)) continue;
    if (!answeredBy.has(uid)) answeredBy.set(uid, new Set());
    answeredBy.get(uid)!.add(key);
  }

  const t = now();
  // focus picture for the current lesson: the last 90 minutes
  const focus = await focusStatsFor(task.id, t - 90 * 60);
  // how the text came to be (whole task, not windowed): pace flags, blocked pastes
  const typing = await typingStatsFor(task.id);
  const students = roster.rows.map((r) => {
    const uid = Number(r.id);
    const rawStage = r.stage != null ? Number(r.stage) : 0;
    // simple tasks have no Part A — anyone who opened the task is in Part B
    const stage = stagesFor(reg.content).length === 0 && rawStage > 0 ? 8 : rawStage;
    const submitted = r.submitted_at != null;
    const lastBeat = r.updated_at != null ? Number(r.updated_at) : null;
    const opened = r.opened_at != null;
    const partADone = stagesDone(reg.content, stage);
    const done = answeredBy.get(uid) ?? new Set<string>();
    const unitsDone = partADone + done.size;
    const status = submitted
      ? "submitted"
      : lastBeat != null && t - lastBeat <= ACTIVE_WINDOW
        ? "active"
        : opened
          ? "idle"
          : "absent";
    const f = focus.get(uid) ?? { exits: 0, awayMs: 0, pasteBlocked: 0, copyBlocked: 0 };
    const ty = typing.get(uid) ?? EMPTY_TYPING;
    return {
      id: uid,
      name:
        ((r.full_name as string | null) ?? String(r.email)) +
        (r.class ? ` (${String(r.class)})` : ""),
      stage,
      unitsDone,
      doneKeys: [...done],
      workSeconds: r.work_seconds != null ? Number(r.work_seconds) : 0,
      lastBeat,
      status,
      focusExits: f.exits,
      focusAwaySec: Math.round(f.awayMs / 1000),
      pasteBlocked: f.pasteBlocked + ty.blockedInserts,
      copyBlocked: f.copyBlocked,
      typingFlag: ty.flagged || ty.rejectedSaves > 0,
      rejectedSaves: ty.rejectedSaves,
      peakCpm: ty.peakCpm,
      typedShare: typedShare(ty),
    };
  });

  // class focus for the projected board: share of PRESENT students with at
  // most 2 window exits. Aggregate only — never per-student on the board.
  const present = students.filter((s) => s.status === "active" || s.status === "submitted");
  const classFocusPct =
    present.length === 0
      ? null
      : Math.round((100 * present.filter((s) => s.focusExits <= 2).length) / present.length);

  return NextResponse.json({
    ok: true,
    now: t,
    classFocusPct,
    task: {
      id: task.id,
      title: reg.content.title,
      subtitle: reg.content.subtitle ?? "",
      bookRef: reg.content.bookRef,
      partAStages: stagesFor(reg.content).length,
      dueAt: task.due_at,
    },
    totalUnits: countTaskUnits(reg),
    units,
    students,
  });
}
