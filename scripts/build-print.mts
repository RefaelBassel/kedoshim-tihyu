// Builds the printable version of every task in the registry:
//   public/print/<ref>.pdf   — A4, 2 cm margins, page numbers, Chromium print
//   public/print/<ref>.docx  — the same worksheet, editable in Word (RTL)
// and content/tasks/print-manifest.json, which the task pages read to show
// the download links. Run after any content change:
//   npx tsx scripts/build-print.mts            (all tasks)
//   npx tsx scripts/build-print.mts vayikra-16-1
//
// Design rules (Rafael): clean, airy pages; right-aligned Hebrew; no
// horizontal separator lines; a question never breaks across pages.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { TASK_REGISTRY, taskPosition } from "../content/tasks/registry";
import type { QuestionBlock, TaskBlock } from "../content/tasks/types";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public", "print");
mkdirSync(OUT, { recursive: true });

const CHROME = [
  "C:/Users/User/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe",
  "C:/Users/User/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("Chromium not found — install Playwright's chromium");

const GRAPE = "#413055";
const COPPER = "#b96a3b";

// ---------------------------------------------------------------------------
// Text for paper: the on-screen wording refers to buttons and narration; on
// paper the passage sits at the top of the page and audio is played in class.
// ---------------------------------------------------------------------------
function forPrint(text: string): string {
  return text
    .replace(/בבלוק ״📖 הפסוקים לעיון״ שבראש המשימה: לחצו על הכפתור ״🎯 אתנחתא״ כדי להדגיש את המילים שבהן היא מסומנת, ולחצו על מספר של פסוק כדי לשמוע אותו\./g,
      "בקטע הפסוקים שבראש הדף חפשו את הסימן ֑ מתחת למילה.")
    .replace(/לעזרה: לחצו על הכפתור ״🎯 אתנחתא״ בבלוק הפסוקים שבראש המשימה\./g, "")
    .replace(/: לחצו על מספר הפסוק 🔊 בבלוק הפסוקים שבראש המשימה\./g, " (בהשמעה בכיתה).")
    .replace(/ \(לחצו על מספר הפסוק 🔊\)/g, " (בהשמעה בכיתה)")
    .replace(/: לחצו על הכפתור ״🔊 האזנה לקטע״ בבלוק הפסוקים שבראש המשימה, ועקבו בתנ״ך הפיזי\./g, " (בהשמעה בכיתה), ועקבו בתנ״ך.")
    .replace(/הכפתור ״🔊 האזנה לקטע״ משמיע אותו מתחילתו ועד סופו\. /g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

interface PrintQuestion {
  n: number;
  prompt: string;
  helper?: string;
  fields?: string[];
  lines: number; // ruled lines per answer box
}
interface PrintSection {
  title: string;
  intro?: string;
  questions: PrintQuestion[];
}

function buildSections(blocks: { title: string; blocks: TaskBlock[] }[]): PrintSection[] {
  let n = 0;
  return blocks.map((sec) => {
    const intro = sec.blocks.find((b) => b.type === "intro");
    const questions: PrintQuestion[] = [];
    for (const b of sec.blocks) {
      if (b.type !== "question") continue;
      const q = b as QuestionBlock;
      n += 1;
      questions.push({
        n,
        prompt: forPrint(q.prompt),
        helper: q.helper ? forPrint(q.helper) : undefined,
        fields: q.fields?.map((f) => forPrint(f.label)),
        lines: q.minWords ? 5 : q.fields ? 2 : 3,
      });
    }
    return {
      title: forPrint(sec.title),
      intro: intro && intro.type === "intro" ? forPrint(intro.body) : undefined,
      questions,
    };
  });
}

// ---------------------------------------------------------------------------
// PDF — HTML + Chromium print
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function html(ref: string): string {
  const reg = TASK_REGISTRY[ref];
  const c = reg.content;
  const pos = taskPosition(ref);
  const sections = buildSections(c.sections);
  const verses = reg.mainPassage.verses;

  const lines = (k: number) =>
    Array.from({ length: k }, () => '<div class="line"></div>').join("");

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700&family=David+Libre:wght@400;700&display=block" rel="stylesheet">
<style>
  @page { size: A4; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Heebo, Arial, sans-serif; font-size: 11.5pt; line-height: 1.65; color: #222; direction: rtl; text-align: right; }
  .kicker { font-size: 9.5pt; letter-spacing: 0.08em; color: ${COPPER}; font-weight: 700; margin: 0 0 2mm; }
  h1 { font-size: 19pt; line-height: 1.3; color: ${GRAPE}; margin: 0 0 1.5mm; font-weight: 700; }
  .book { font-size: 10.5pt; color: #666; margin: 0 0 6mm; }
  .idline { display: flex; gap: 10mm; font-size: 10.5pt; color: #444; margin: 0 0 7mm; }
  .idline span { flex: 1; border-bottom: 1px solid #999; padding-bottom: 1mm; }
  .passage { background: #faf6f0; border-radius: 3mm; padding: 5mm 6mm; margin: 0 0 7mm; }
  .passage .ref { font-size: 10pt; font-weight: 700; color: ${COPPER}; margin: 0 0 2mm; font-family: Heebo, Arial, sans-serif; }
  .passage p { font-family: "David Libre", "Times New Roman", serif; font-size: 14.5pt; line-height: 2.05; margin: 0; text-align: justify; }
  .passage .vn { font-family: Heebo, Arial, sans-serif; font-size: 8.5pt; font-weight: 700; color: ${COPPER}; margin-left: 1.5mm; vertical-align: 0.35em; }
  h2 { font-size: 13.5pt; color: ${GRAPE}; margin: 7mm 0 2.5mm; font-weight: 700; break-after: avoid; }
  .intro { color: #555; font-size: 10.5pt; margin: 0 0 4mm; }
  .q { margin: 0 0 6mm; }
  .q.single { break-inside: avoid; }
  .q .prompt { font-weight: 500; margin: 0 0 1.5mm; break-after: avoid; }
  .q .num { font-weight: 700; color: ${GRAPE}; margin-left: 2mm; }
  .q .helper { color: #666; font-size: 10pt; margin: 0 0 1.5mm; }
  .field { margin: 1.5mm 0 0; break-inside: avoid; }
  .field .label { font-size: 10.5pt; color: ${GRAPE}; font-weight: 500; margin: 0 0 0.5mm; }
  .line { height: 8.5mm; border-bottom: 1px solid #bdbdbd; }
</style></head><body>
<p class="kicker">${esc(pos ? `${pos.unit} · משימה ${pos.order} מתוך ${pos.total}` : "")}</p>
<h1>${esc(c.title)}</h1>
<p class="book">${esc(c.bookRef)}${c.subtitle ? " · " + esc(c.subtitle) : ""}</p>
<div class="idline"><span>שם:</span><span>כיתה:</span><span>תאריך:</span></div>
<div class="passage">
  <p class="ref">${esc(reg.mainPassage.ref)}</p>
  <p>${verses.map((v) => `<span class="vn">(${esc(v.num)})</span>${esc(v.text)}`).join(" ")}</p>
</div>
${sections
  .map(
    (s) => `<h2>${esc(s.title)}</h2>
${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
${s.questions
  .map(
    (q) => `<div class="q${q.fields ? "" : " single"}">
  <p class="prompt"><span class="num">${q.n}.</span>${esc(q.prompt)}</p>
  ${q.helper ? `<p class="helper">${esc(q.helper)}</p>` : ""}
  ${
    q.fields
      ? q.fields.map((f) => `<div class="field"><p class="label">${esc(f)}</p>${lines(q.lines)}</div>`).join("")
      : lines(q.lines)
  }
</div>`
  )
  .join("\n")}`
  )
  .join("\n")}
</body></html>`;
}

async function buildPdf(ref: string, browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const page = await browser.newPage();
  await page.setContent(html(ref), { waitUntil: "networkidle" });
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<void> } }).fonts.ready);
  const title = TASK_REGISTRY[ref].content.title;
  await page.pdf({
    path: join(OUT, `${ref}.pdf`),
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div dir="rtl" style="width:100%;font-family:Arial,sans-serif;font-size:8pt;color:#888;padding:0 18mm;display:flex;justify-content:space-between;">
      <span>קדושים תהיו · ${esc(title)}</span><span>עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span></div>`,
  });
  await page.close();
}

// ---------------------------------------------------------------------------
// DOCX — editable worksheet, RTL, same structure
// ---------------------------------------------------------------------------
const BODY = "Arial";
const MIKRA = "Times New Roman"; // has nikud + cantillation glyphs on Windows and Mac

function run(text: string, opts: Partial<ConstructorParameters<typeof TextRun>[0] & object> = {}) {
  return new TextRun({ text, rightToLeft: true, font: BODY, size: 23, ...opts });
}
function para(children: TextRun[], opts: Record<string, unknown> = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 100, line: 340 },
    children,
    ...opts,
  });
}
function ruledLine() {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 0, after: 0, line: 480 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "BDBDBD", space: 1 } },
    children: [run(" ")],
  });
}

async function buildDocx(ref: string) {
  const reg = TASK_REGISTRY[ref];
  const c = reg.content;
  const pos = taskPosition(ref);
  const sections = buildSections(c.sections);
  const children: Paragraph[] = [];

  children.push(
    para([run(pos ? `${pos.unit} · משימה ${pos.order} מתוך ${pos.total}` : "", { bold: true, color: "B96A3B", size: 19 })], { spacing: { after: 60 } }),
    para([run(c.title, { bold: true, size: 36, color: "413055" })], { spacing: { after: 60 } }),
    para([run(`${c.bookRef}${c.subtitle ? " · " + c.subtitle : ""}`, { color: "666666", size: 21 })], { spacing: { after: 240 } }),
    para([run("שם: ______________________    כיתה: __________    תאריך: ____________", { size: 21, color: "444444" })], { spacing: { after: 300 } }),
    para([run(reg.mainPassage.ref, { bold: true, color: "B96A3B", size: 20 })], { spacing: { after: 60 }, keepNext: true }),
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.BOTH,
      spacing: { after: 320, line: 400 },
      shading: { fill: "FAF6F0" },
      children: reg.mainPassage.verses.flatMap((v) => [
        new TextRun({ text: `(${v.num}) `, rightToLeft: true, font: BODY, size: 16, bold: true, color: "B96A3B" }),
        new TextRun({ text: v.text + " ", rightToLeft: true, font: MIKRA, size: 29 }),
      ]),
    })
  );

  for (const s of sections) {
    children.push(
      para([run(s.title, { bold: true, size: 27, color: "413055" })], { spacing: { before: 280, after: 100 }, keepNext: true })
    );
    if (s.intro) children.push(para([run(s.intro, { color: "555555", size: 21 })], { keepNext: true }));
    for (const q of s.questions) {
      children.push(
        para([run(`${q.n}. `, { bold: true, color: "413055" }), run(q.prompt)], { keepNext: true, keepLines: true, spacing: { before: 120, after: 60 } })
      );
      if (q.helper) children.push(para([run(q.helper, { color: "666666", size: 20 })], { keepNext: true }));
      if (q.fields) {
        for (const f of q.fields) {
          children.push(para([run(f, { color: "413055", size: 21 })], { keepNext: true, spacing: { before: 60, after: 20 } }));
          for (let i = 0; i < q.lines; i++) children.push(ruledLine());
        }
      } else {
        for (let i = 0; i < q.lines; i++) children.push(ruledLine());
      }
    }
  }

  const doc = new Document({
    creator: "קדושים תהיו",
    title: c.title,
    styles: { default: { document: { run: { font: BODY, size: 23, rightToLeft: true } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, bottom: 1134, left: 1021, right: 1021 }, // 2 cm / 1.8 cm
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "עמוד ", rightToLeft: true, font: BODY, size: 16, color: "888888" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: BODY, size: 16, color: "888888" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  writeFileSync(join(OUT, `${ref}.docx`), await Packer.toBuffer(doc));
}

// ---------------------------------------------------------------------------
async function main() {
  const only = new Set(process.argv.slice(2));
  const refs = Object.keys(TASK_REGISTRY).filter((r) => only.size === 0 || only.has(r));
  const browser = await chromium.launch({ executablePath: CHROME });
  const manifest: Record<string, { pdf: string; docx: string }> = existsSync(join(ROOT, "content/tasks/print-manifest.json"))
    ? JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(join(ROOT, "content/tasks/print-manifest.json"), "utf8")))
    : {};
  for (const ref of refs) {
    await buildPdf(ref, browser);
    await buildDocx(ref);
    manifest[ref] = { pdf: `/print/${ref}.pdf`, docx: `/print/${ref}.docx` };
    console.log("built", ref);
  }
  await browser.close();
  writeFileSync(join(ROOT, "content/tasks/print-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
