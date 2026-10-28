import { NextResponse } from "next/server";
import { requireStudentTask } from "@/lib/api-auth";
import { setTaskStep } from "@/lib/tasks";

// The worksheet screen the student is on (issue #21) — a question key or
// "summary"; the task page reopens there.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const guard = await requireStudentTask(taskId);
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null);
  const step = typeof body?.step === "string" ? body.step.trim().slice(0, 160) : "";
  if (!step) return NextResponse.json({ error: "חסר מיקום." }, { status: 400 });
  await setTaskStep(guard.task.id, guard.userId, step);
  return NextResponse.json({ ok: true });
}
