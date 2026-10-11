import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { deleteExam, getExam, saveExam, type ExamDoc } from "@/lib/exams";

export async function GET(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  const exam = await getExam(Number(examId));
  if (!exam) return NextResponse.json({ error: "המבחן לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true, exam });
}

// PUT { doc, status }: the teacher's edits
export async function PUT(req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.doc || !Array.isArray(body.doc.sections)) return NextResponse.json({ error: "תוכן חסר" }, { status: 400 });
  const status = body.status === "ready" ? "ready" : "draft";
  const exam = await saveExam(Number(examId), body.doc as ExamDoc, status);
  if (!exam) return NextResponse.json({ error: "המבחן לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true, exam });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  await deleteExam(Number(examId));
  return NextResponse.json({ ok: true });
}
