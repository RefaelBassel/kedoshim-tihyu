import { NextResponse } from "next/server";
import { requirePrep } from "@/lib/prep-auth";
import { checkAnswer } from "@/lib/exam-prep";

// POST { itemId, answer } → right or not (and the explanation when right).
// POST { itemId, reveal: true } → the answer, after enough wrong tries.
export async function POST(req: Request, { params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const guard = await requirePrep(prepId);
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => null);
  const itemId = String(body?.itemId ?? "");
  const result = await checkAnswer(guard.prep, guard.user.id, itemId, body?.answer, body?.reveal === true);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
