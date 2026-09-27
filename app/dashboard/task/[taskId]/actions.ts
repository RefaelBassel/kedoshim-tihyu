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

// Cancel = the task disappears from every student, but NOTHING is deleted:
// answers, progress, grades and reflections all stay, and "republish" brings
// the task back exactly as it was. (The old version hard-deleted the task and
// all student work — replaced 2026-09-27.)
export async function unpublishTask(taskId: number) {
  if (!(await requireRealTeacher())) return { ok: false, error: "למורים בלבד." };
  const { cancelTaskAssignment } = await import("@/lib/tasks");
  await cancelTaskAssignment(taskId);
  revalidate(taskId);
  return { ok: true };
}

export async function republishTaskAction(taskId: number) {
  if (!(await requireRealTeacher())) return { ok: false, error: "למורים בלבד." };
  const { republishTask } = await import("@/lib/tasks");
  await republishTask(taskId);
  revalidate(taskId);
  return { ok: true };
}
