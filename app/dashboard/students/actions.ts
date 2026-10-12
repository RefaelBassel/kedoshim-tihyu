"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  approveUser,
  blockUser,
  makeStudent,
  makeTeacher,
  preApproveEmail,
  removeUser,
  unblockUser,
} from "@/lib/approval";
import { mergeAccounts, planMerge } from "@/lib/account-merge";

// Roster actions — real teachers only (the session role comes from the
// lib/roles.ts whitelist, never from user input).
async function requireTeacher(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "teacher";
}

const done = () => {
  revalidatePath("/dashboard/students");
  revalidatePath("/dashboard");
};

export async function approveAction(userId: number) {
  if (!(await requireTeacher())) return { ok: false, error: "למורות בלבד." };
  await approveUser(userId);
  done();
  return { ok: true };
}

export async function blockAction(userId: number) {
  if (!(await requireTeacher())) return { ok: false, error: "למורות בלבד." };
  await blockUser(userId);
  done();
  return { ok: true };
}

export async function unblockAction(userId: number) {
  if (!(await requireTeacher())) return { ok: false, error: "למורות בלבד." };
  await unblockUser(userId);
  done();
  return { ok: true };
}

export async function removeAction(userId: number) {
  if (!(await requireTeacher())) return { ok: false, error: "למורות בלבד." };
  await removeUser(userId);
  done();
  return { ok: true };
}

export async function makeTeacherAction(userId: number) {
  if (!(await requireTeacher())) return { ok: false, error: "למורות בלבד." };
  await makeTeacher(userId);
  done();
  return { ok: true };
}

export async function makeStudentAction(userId: number) {
  if (!(await requireTeacher())) return { ok: false, error: "למורות בלבד." };
  const ok = await makeStudent(userId);
  done();
  return { ok };
}

// Merging two accounts of the same student: first the summary for the
// confirmation, then the merge itself (lib/account-merge.ts).
export async function mergePreviewAction(keepId: number, mergedId: number) {
  if (!(await requireTeacher())) return { ok: false as const, error: "למורות בלבד." };
  const plan = await planMerge(keepId, mergedId);
  if ("error" in plan) return { ok: false as const, error: plan.error };
  return { ok: true as const, lines: plan.lines };
}

export async function mergeAction(keepId: number, mergedId: number) {
  const session = await auth();
  if (session?.user?.role !== "teacher") return { ok: false, error: "למורות בלבד." };
  const r = await mergeAccounts(keepId, mergedId, { by: Number(session.user.id) || null });
  done();
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function preApproveAction(emails: string) {
  if (!(await requireTeacher())) return { ok: false, error: "למורות בלבד.", added: 0 };
  const list = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  let added = 0;
  for (const e of list) {
    if (await preApproveEmail(e)) added += 1;
  }
  done();
  return { ok: true, added };
}
