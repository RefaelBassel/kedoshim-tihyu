import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { proposalsForUnit, proposalsOverview, setProposalFlags } from "@/lib/amana";

// Student proposals for the charter (teacher only). GET ?unit=<ref> = one
// unit, without = every unit that has a charter question. POST sets whether
// a proposal is shown to the class and whether with the student's name.
export async function GET(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const unit = new URL(req.url).searchParams.get("unit");
  if (unit) {
    const p = await proposalsForUnit(unit);
    if (!p) return NextResponse.json({ error: "היחידה לא נמצאה." }, { status: 404 });
    return NextResponse.json({ ok: true, units: [p] });
  }
  return NextResponse.json({ ok: true, units: await proposalsOverview() });
}

export async function POST(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => null);
  const ref = typeof body?.ref === "string" ? body.ref : "";
  const userId = Number(body?.userId);
  const questionKey = typeof body?.questionKey === "string" ? body.questionKey : "";
  if (!ref || !Number.isFinite(userId) || !questionKey) return NextResponse.json({ error: "חסרים פרטי ההצעה." }, { status: 400 });
  const flags = await setProposalFlags(ref, userId, questionKey, {
    shown: typeof body.shown === "boolean" ? body.shown : undefined,
    showName: typeof body.showName === "boolean" ? body.showName : undefined,
  });
  return NextResponse.json({ ok: true, ...flags });
}
