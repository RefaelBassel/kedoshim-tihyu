import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { getTask } from "@/lib/tasks";
import { getOrCreateDiscussion } from "@/lib/discussion";

// Open (or resume) the discussion of a task. Both teacher surfaces — the
// projected board and the control page — call this to learn the discussion
// id, so opening either one first is fine.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { taskId: raw } = await params;
  const task = await getTask(Number(raw));
  if (!task) return NextResponse.json({ error: "המשימה לא נמצאה." }, { status: 404 });
  const id = await getOrCreateDiscussion(task.id, guard.userId);
  return NextResponse.json({ ok: true, id });
}
