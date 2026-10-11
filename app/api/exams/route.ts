import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { generateChapter16Exam, listExams } from "@/lib/exams";

// generating a whole exam with Opus takes a few minutes
export const maxDuration = 800;

export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  return NextResponse.json({ ok: true, exams: await listExams() });
}

// POST: ask Claude for a new draft of the chapter-16 exam
export async function POST() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  try {
    const exam = await generateChapter16Exam(guard.userId);
    return NextResponse.json({ ok: true, exam });
  } catch (e) {
    console.error("exam generation failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "חיבור המבחן נכשל" }, { status: 502 });
  }
}
