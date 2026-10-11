import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ExamDoc, ExamRow } from "./exams";
import { totalPoints } from "./exams";
import { linesFor, partHeading, type ExamVersion } from "./exam-export-shared";

// ------------------------------------------------------------- Word ------
// docx: `bidirectional` on the paragraph gives RTL paragraph direction,
// `rightToLeft` on the run gives RTL text; alignment is explicit everywhere.
function p(text: string, opts: { bold?: boolean; size?: number; font?: string; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; shade?: boolean } = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    heading: opts.heading,
    spacing: { after: opts.after ?? 80, before: opts.before ?? 0 },
    shading: opts.shade ? { fill: "F2F2F2" } : undefined,
    children: text
      .split("\n")
      .flatMap((line, i) => [
        ...(i > 0 ? [new TextRun({ break: 1 })] : []),
        new TextRun({ text: line, rightToLeft: true, bold: opts.bold, size: opts.size ?? 24, font: opts.font ?? "David" }),
      ]),
  });
}

function answerLines(n: number) {
  return Array.from({ length: n }, () =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999", space: 1 } },
      children: [new TextRun({ text: " ", rightToLeft: true, size: 24 })],
    })
  );
}

export async function examToDocx(exam: ExamRow, version: ExamVersion): Promise<Buffer> {
  const doc: ExamDoc = exam.doc;
  const children: Paragraph[] = [];
  children.push(p("תיכון שחרית · בית מדרש תורה שבכתב · כיתה ט", { size: 20 }));
  children.push(p(doc.title, { bold: true, size: 36, heading: HeadingLevel.TITLE, after: 60 }));
  if (doc.subtitle) children.push(p(doc.subtitle, { size: 24, after: 120 }));
  children.push(
    p(`שם: ______________________    כיתה: ________    תאריך: ____________    משך: ${doc.durationMin} דק׳    סה״כ: ${totalPoints(doc)} נק׳`, { size: 22, after: 160 })
  );
  if (doc.instructions) children.push(p(doc.instructions, { size: 22, after: 200, shade: true }));
  if (version === "teacher") children.push(p("גרסת מורה — עם תשובות ומחוון", { bold: true, size: 22, after: 200 }));

  doc.sections.forEach((s, si) => {
    const pts = s.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
    children.push(p(partHeading(si, s.title, pts), { bold: true, size: 28, heading: HeadingLevel.HEADING_1, before: 240, after: 60 }));
    if (s.intro) children.push(p(s.intro, { size: 22, after: 120 }));
    s.questions.forEach((q, qi) => {
      if (q.verse) children.push(p(`(${q.verseNum}) ${q.verse}`, { size: 26, font: "Times New Roman", after: 80, shade: true }));
      children.push(p(`${qi + 1}. ${q.text} (${q.points} נק׳)`, { size: 24, after: 60 }));
      if (version === "teacher") children.push(p(`✔ ${q.answer}`, { size: 22, after: 160, shade: true }));
      else children.push(...answerLines(linesFor(s.key)));
    });
  });
  children.push(p("בהצלחה!", { bold: true, size: 24, before: 240, align: AlignmentType.CENTER }));

  const file = new Document({
    creator: "קדושים תהיו",
    title: doc.title,
    styles: { default: { document: { run: { font: "David", size: 24, rightToLeft: true } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(file));
}

