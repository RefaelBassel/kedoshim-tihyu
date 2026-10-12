import type { ExamDoc, ExamQuestion } from "./exams";

// Shared bits of the exam exporters (Word in exam-docx.ts, PDF in
// exam-pdf.tsx — kept apart so the Word exporter never loads the PDF engine).
// Pure: the editor and the print page use these too.
export type ExamVersion = "student" | "teacher";

const LINES: Record<string, number> = {
  pshat: 2,
  quotes: 2,
  etnachta: 3,
  study: 5,
  argument: 10,
  map: 5,
  comprehension: 4,
  taamim: 4,
};
export const linesFor = (key: string) => LINES[key] ?? 4;
// a question may set its own number of answer lines
export const linesForQuestion = (key: string, q: Pick<ExamQuestion, "lines">) =>
  q.lines != null ? q.lines : linesFor(key);
export const partLabel = (i: number) => `חלק ${i + 1}`;
// "חלק 1: חלק א — …" read badly; a title that already starts with חלק stands alone
export const partHeading = (i: number, title: string, pts: number) =>
  `${title.trim().startsWith("חלק") ? title.trim() : `${partLabel(i)}: ${title.trim()}`} (${pts} נק׳)`;

// 2026-10-18 → 18.10.2026
export function formatExamDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : "";
}

// questions are numbered straight through the exam (1–13), not per part
export function questionNumbers(doc: ExamDoc): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const s of doc.sections) for (const q of s.questions) out.set(q.id, ++n);
  return out;
}
