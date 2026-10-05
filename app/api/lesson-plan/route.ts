import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import {
  getPlan,
  unitsOverview,
  savePlan,
  movePlan,
  stopPlan,
  type PlanBlock,
} from "@/lib/lesson-plan";

// Today's lesson plan — teacher only. GET returns the plan and the picker
// options; PUT replaces the block list; POST moves the "now" pointer.
export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const [plan, units] = await Promise.all([getPlan(), unitsOverview()]);
  return NextResponse.json({ ok: true, plan, units });
}

export async function PUT(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.blocks) ? body.blocks : [];
  const blocks: PlanBlock[] = raw
    .map((b: Record<string, unknown>) => ({
      kind: b.kind === "review" || b.kind === "discussion" || b.kind === "study" ? b.kind : null,
      taskId: Number(b.taskId),
      title: String(b.title ?? "").slice(0, 200),
      id: typeof b.id === "string" ? b.id.slice(0, 60) : undefined,
      done: b.done === true ? true : undefined,
    }))
    .filter((b: { kind: string | null; taskId: number }) => b.kind && Number.isInteger(b.taskId)) as PlanBlock[];
  await savePlan(blocks, guard.userId);
  const plan = await getPlan();
  return NextResponse.json({ ok: true, plan });
}

export async function POST(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => ({}));
  switch (String(body?.action)) {
    case "start":
      await movePlan("start");
      break;
    case "next":
      await movePlan("next");
      break;
    case "prev":
      await movePlan("prev");
      break;
    case "goto":
      await movePlan("goto", Number(body.index));
      break;
    case "stop":
      await stopPlan();
      break;
    case "cancel": {
      const { cancelPlan } = await import("@/lib/lesson-plan");
      await cancelPlan();
      break;
    }
    default:
      return NextResponse.json({ error: "פעולה לא ידועה." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, plan: await getPlan() });
}
