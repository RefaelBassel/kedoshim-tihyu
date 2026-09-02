"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { now } from "@/lib/tasks";
import { israelLocalToUnix } from "@/lib/hebrew";

// Teacher-only task management: due date, per-student (un)assignment, and
// taking a task off the class entirely. Every action re-checks the session
// (server actions are public endpoints) and revalidates the affected pages.

async function requireRealTeacher(): Promise<boolean> {
  const session = await auth();
  const u = session?.user;
  return Boolean(u?.id && !u.guest && u.role === "teacher");
}

function revalidate(taskId: number) {
  revalidatePath(`/dashboard/task/${taskId}`);
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  revalidatePath("/me");
  revalidatePath("/");
}

// Change the final submission date (un-submit stays allowed until it).
export async function updateDueDate(taskId: number, dueDate: string, dueTime = "23:59") {
  if (!(await requireRealTeacher())) return { ok: false, error: "למורים בלבד." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, error: "תאריך לא תקין." };
  if (!/^\d{2}:\d{2}$/.test(dueTime)) return { ok: false, error: "שעה לא תקינה." };
  const dueAt = israelLocalToUnix(dueDate, dueTime);
  await db().execute({
    sql: "UPDATE tasks SET due_at = ? WHERE id = ?",
    args: [dueAt, taskId],
  });
  revalidate(taskId);
  return { ok: true };
}

// Remove one student from the task. Their answers stay in the DB (nothing is
// deleted) — re-assigning brings everything back exactly as it was.
export async function unassignStudent(taskId: number, userId: number) {
  if (!(await requireRealTeacher())) return { ok: false, error: "למורים בלבד." };
  await db().execute({
    sql: "DELETE FROM task_assignments WHERE task_id = ? AND user_id = ?",
    args: [taskId, userId],
  });
  revalidate(taskId);
  return { ok: true };
}

export async function assignStudent(taskId: number, userId: number) {
  if (!(await requireRealTeacher())) return { ok: false, error: "למורים בלבד." };
  await db().execute({
    sql: `INSERT OR IGNORE INTO task_assignments (task_id, user_id, assigned_at) VALUES (?, ?, ?)`,
    args: [taskId, userId, now()],
  });
  revalidate(taskId);
  return { ok: true };
}

// Take the task off the class completely: the task row and everything
// attached to it are deleted, and the content returns to the "publish"
// dropdown on the dashboard. Student answers on it are lost — the UI asks
// for confirmation when any work exists.
export async function unpublishTask(taskId: number) {
  if (!(await requireRealTeacher())) return { ok: false, error: "למורים בלבד." };
  const client = db();
  for (const table of [
    "task_assignments",
    "task_progress",
    "task_answers",
    "text_markings",
    "grades",
    "assist_log",
    "reflections",
  ]) {
    await client.execute({ sql: `DELETE FROM ${table} WHERE task_id = ?`, args: [taskId] });
  }
  await client.execute({
    sql: "UPDATE question_bank SET task_id = NULL WHERE task_id = ?",
    args: [taskId],
  });
  await client.execute({ sql: "DELETE FROM tasks WHERE id = ?", args: [taskId] });
  revalidate(taskId);
  return { ok: true };
}
