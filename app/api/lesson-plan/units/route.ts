import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { markDoneUpTo, setUnitDone, unitsOverview, type BlockKind } from "@/lib/lesson-plan";

// The teacher's own marks on the journey — teacher only.
// { action: "set", taskId, kind, on }  — tick / untick one circle
// { action: "up-to", taskId }          — everything up to here was taught
export async function POST(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => ({}));
  const taskId = Number(body?.taskId);
  if (!Number.isInteger(taskId)) return NextResponse.json({ ok: false, error: "bad task" }, { status: 400 });
  const action = String(body?.action);
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
