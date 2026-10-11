// Shared bits of the exam exporters (Word in exam-docx.ts, PDF in
// exam-pdf.tsx — kept apart so the Word exporter never loads the PDF engine).
export type ExamVersion = "student" | "teacher";

const LINES: Record<string, number> = { pshat: 2, quotes: 2, etnachta: 3, study: 5, argument: 10 };
export const linesFor = (key: string) => LINES[key] ?? 4;
export const partLabel = (i: number) => `חלק ${i + 1}`;
// "חלק 1: חלק א — …" read badly; a title that already starts with חלק stands alone
export const partHeading = (i: number, title: string, pts: number) =>
  `${title.trim().startsWith("חלק") ? title.trim() : `${partLabel(i)}: ${title.trim()}`} (${pts} נק׳)`;
