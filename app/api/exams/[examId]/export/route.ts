import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { getExam } from "@/lib/exams";
import { examToDocx } from "@/lib/exam-docx";
import { examToPdf } from "@/lib/exam-pdf";
import type { ExamVersion } from "@/lib/exam-export-shared";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET ?format=docx|pdf&v=student|teacher — the exam as a downloadable file
export async function GET(req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { examId } = await params;
  const exam = await getExam(Number(examId));
  if (!exam) return NextResponse.json({ error: "המבחן לא נמצא" }, { status: 404 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "docx";
  const version: ExamVersion = url.searchParams.get("v") === "teacher" ? "teacher" : "student";
  try {
    const body = format === "pdf" ? await examToPdf(exam, version) : await examToDocx(exam, version);
    const base = `${exam.doc.title} — ${version === "teacher" ? "גרסת מורה" : "גרסת תלמיד"}`.replace(/[\\/:*?"<>|]+/g, " ");
    const ascii = `exam-${exam.id}-${version}.${format}`;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base + "." + format)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("exam export failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "יצירת הקובץ נכשלה" }, { status: 500 });
  }
}
