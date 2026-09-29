import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { markDoneUpTo, setUnitDone, unitsOverview, type BlockKind } from "@/lib/lesson-plan";
import { publishUnit } from "@/lib/tasks";
import { israelLocalToUnix } from "@/lib/hebrew";

// a week from today (Israel), end of day — the default due date when a unit
// is given to the class straight from the reels
function defaultDueDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + 7 * 86400000)
  );
}

// The teacher's own marks on the journey — teacher only.
// { action: "set", taskId, kind, on }  — tick / untick one circle
// { action: "up-to", taskId }          — everything up to here was taught
export async function POST(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action);
  // { action: "publish", refs: string[], dueDate?: "YYYY-MM-DD", dueTime?: "HH:MM" }
  // — give these units to the whole class (create or re-assign)
  if (action === "publish") {
    const refs: string[] = Array.isArray(body?.refs) ? body.refs.map(String).slice(0, 20) : [];
    if (refs.length === 0) return NextResponse.json({ ok: false, error: "no refs" }, { status: 400 });
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.dueDate ?? "")) ? String(body.dueDate) : defaultDueDate();
    const dueTime = /^\d{2}:\d{2}$/.test(String(body?.dueTime ?? "")) ? String(body.dueTime) : "23:59";
    const dueAt = israelLocalToUnix(dueDate, dueTime);
    for (const ref of refs) await publishUnit(ref, dueAt, guard.userId);
    const units = await unitsOverview();
    return NextResponse.json({ ok: true, units });
  }
  const taskId = Number(body?.taskId);
  if (!Number.isInteger(taskId)) return NextResponse.json({ ok: false, error: "bad task" }, { status: 400 });
  if (action === "set") {
    const kind = body?.kind as BlockKind;
    if (kind !== "review" && kind !== "discussion" && kind !== "study") {
      return NextResponse.json({ ok: false, error: "bad kind" }, { status: 400 });
    }
    await setUnitDone(taskId, kind, Boolean(body?.on));
  } else if (action === "up-to") {
    await markDoneUpTo(taskId);
  } else {
    return NextResponse.json({ ok: false, error: "bad action" }, { status: 400 });
  }
  const units = await unitsOverview();
  return NextResponse.json({ ok: true, units });
}
