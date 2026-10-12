import { NextResponse } from "next/server";
import { requirePrep } from "@/lib/prep-auth";
import { argumentFeedback } from "@/lib/exam-prep";

export const maxDuration = 120;

// POST { ref, claim, reason, evidence } → a short feedback from Claude; the
// argument counts as done in the student's preparation.
export async function POST(req: Request, { params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const guard = await requirePrep(prepId);
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => null);
  try {
    const result = await argumentFeedback(guard.prep, guard.user, {
      ref: String(body?.ref ?? "").slice(0, 80),
      claim: String(body?.claim ?? "").slice(0, 1500),
      reason: String(body?.reason ?? "").slice(0, 1500),
      evidence: String(body?.evidence ?? "").slice(0, 1500),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("prep argument feedback failed", e);
    return NextResponse.json({ error: "המשוב לא הגיע — נסו שוב בעוד רגע." }, { status: 502 });
  }
}
