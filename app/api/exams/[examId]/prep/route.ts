import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { generatePrep, getPrepForExam, savePrep, type PrepDoc } from "@/lib/exam-prep";

export const maxDuration = 800;

export async function GET(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  return NextResponse.json({ ok: true, prep: await getPrepForExam(Number(examId)) });
}

// POST: Claude writes (or rewrites) the preparation for this exam — as a draft
export async function POST(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  try {
    const prep = await generatePrep(Number(examId));
    return NextResponse.json({ ok: true, prep });
  } catch (e) {
    console.error("prep generation failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "הפקת ההכנה נכשלה" }, { status: 502 });
  }
}

// PUT { doc, status }: the teacher's edits; status "published" shows it to students
export async function PUT(req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.doc || !Array.isArray(body.doc.practice)) return NextResponse.json({ error: "תוכן חסר" }, { status: 400 });
  const prep = await savePrep(Number(examId), body.doc as PrepDoc, body.status === "published" ? "published" : "draft");
  return NextResponse.json({ ok: true, prep });
}
