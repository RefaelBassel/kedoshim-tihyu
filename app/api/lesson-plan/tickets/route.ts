import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { getTask } from "@/lib/tasks";
import { eligibilityFor, getDiscussionState, openDiscussionFor } from "@/lib/discussion";

// Who holds an entry ticket to the debate on a unit — teacher only.
// A ticket = answered every worksheet question of the unit, or was given one
// by hand on the control page (an approval in the open discussion).
// GET /api/lesson-plan/tickets?taskId=N
export async function GET(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const taskId = Number(new URL(req.url).searchParams.get("taskId"));
  if (!Number.isInteger(taskId)) return NextResponse.json({ ok: false, error: "bad task" }, { status: 400 });
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ ok: false, error: "no task" }, { status: 404 });
  const elig = await eligibilityFor(taskId);
  const openId = await openDiscussionFor(taskId);
  const approved = new Map<number, boolean>();
  if (openId) {
    const st = await getDiscussionState(openId);
    for (const p of st?.participants ?? []) approved.set(p.userId, p.approved);
  }
  const people = elig.map((e) => {
    const manual = approved.get(e.userId) === true && !e.complete;
    const removed = approved.has(e.userId) && approved.get(e.userId) === false && e.complete;
    return {
      userId: e.userId,
      name: e.name,
      answered: e.answered,
      total: e.total,
      ticket: (e.complete && !removed) || manual,
      manual,
    };
  });
  return NextResponse.json({
    ok: true,
    taskId,
    title: task.title,
    discussionId: openId,
    holders: people.filter((p) => p.ticket),
    waiting: people.filter((p) => !p.ticket),
  });
}
