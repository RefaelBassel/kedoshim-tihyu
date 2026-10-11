import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { getExam, regenerateQuestion } from "@/lib/exams";

export const maxDuration = 300;

// POST { sectionKey, questionId, instruction? }: one replacement question
// from Claude. Nothing is saved — the editor shows it and the teacher saves.
export async function POST(req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  const exam = await getExam(Number(examId));
  if (!exam) return NextResponse.json({ error: "המבחן לא נמצא" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  try {
    const question = await regenerateQuestion(
      exam,
      String(body?.sectionKey ?? ""),
      String(body?.questionId ?? ""),
      String(body?.instruction ?? "").slice(0, 600)
    );
    return NextResponse.json({ ok: true, question });
  } catch (e) {
    console.error("question regeneration failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "לא הצליח" }, { status: 502 });
  }
}
