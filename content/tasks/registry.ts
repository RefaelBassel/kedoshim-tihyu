import type { TaskContent, PassageBlock } from "./types";
import { vayikra16a, vayikra16aMainPassage } from "./vayikra-16-1";
import { vayikra16b, vayikra16bMainPassage } from "./vayikra-16-2";
import { vayikra16c, vayikra16cMainPassage } from "./vayikra-16-3";
import { vayikra16d, vayikra16dMainPassage } from "./vayikra-16-4";
import { vayikra16e, vayikra16eMainPassage } from "./vayikra-16-5";
import { nedava1, nedava1MainPassage, nedava2, nedava2MainPassage, nedava3, nedava3MainPassage } from "./nedava";
import { miluim1, miluim1MainPassage, miluim2, miluim2MainPassage, miluim3, miluim3MainPassage } from "./miluim";
import { tahara1, tahara1MainPassage, tahara2, tahara2MainPassage, tahara3, tahara3MainPassage } from "./tahara";
import { kedusha1, kedusha1MainPassage, kedusha2, kedusha2MainPassage } from "./kedusha";
import { kedoshim1, kedoshim1MainPassage, kedoshim2, kedoshim2MainPassage, kedoshim3, kedoshim3MainPassage } from "./kedoshim";
import { moadim1, moadim1MainPassage, moadim2, moadim2MainPassage, moadim3, moadim3MainPassage } from "./moadim";
import { brit1, brit1MainPassage, brit2, brit2MainPassage } from "./brit";
import { shaul1, shaul1MainPassage, shaul2, shaul2MainPassage, shaul3, shaul3MainPassage } from "./shaul";
import { melech1, melech1MainPassage, melech2, melech2MainPassage, melech3, melech3MainPassage } from "./melech";
import { batsheva1, batsheva1MainPassage, batsheva2, batsheva2MainPassage, batsheva3, batsheva3MainPassage, batsheva4, batsheva4MainPassage } from "./batsheva";
import { avshalom1, avshalom1MainPassage, avshalom2, avshalom2MainPassage, avshalom3, avshalom3MainPassage, avshalom4, avshalom4MainPassage } from "./avshalom";
import { mifkad1, mifkad1MainPassage, mifkad2, mifkad2MainPassage } from "./mifkad";
import printManifest from "./print-manifest.json";

// Registry of task content, keyed by content_ref stored on the tasks table.
// The teacher publishes a task by picking a ref from here.
export interface RegisteredTask {
  content: TaskContent;
  mainPassage: PassageBlock;
}

export const TASK_REGISTRY: Record<string, RegisteredTask> = {
  "vayikra-16-1": { content: vayikra16a, mainPassage: vayikra16aMainPassage },
  "vayikra-16-2": { content: vayikra16b, mainPassage: vayikra16bMainPassage },
  "vayikra-16-3": { content: vayikra16c, mainPassage: vayikra16cMainPassage },
  "vayikra-16-4": { content: vayikra16d, mainPassage: vayikra16dMainPassage },
  "vayikra-16-5": { content: vayikra16e, mainPassage: vayikra16eMainPassage },
  "nedava-1": { content: nedava1, mainPassage: nedava1MainPassage },
  "nedava-2": { content: nedava2, mainPassage: nedava2MainPassage },
  "nedava-3": { content: nedava3, mainPassage: nedava3MainPassage },
  "miluim-1": { content: miluim1, mainPassage: miluim1MainPassage },
  "miluim-2": { content: miluim2, mainPassage: miluim2MainPassage },
  "miluim-3": { content: miluim3, mainPassage: miluim3MainPassage },
  "tahara-1": { content: tahara1, mainPassage: tahara1MainPassage },
  "tahara-2": { content: tahara2, mainPassage: tahara2MainPassage },
  "tahara-3": { content: tahara3, mainPassage: tahara3MainPassage },
  "kedusha-1": { content: kedusha1, mainPassage: kedusha1MainPassage },
  "kedusha-2": { content: kedusha2, mainPassage: kedusha2MainPassage },
  "kedoshim-1": { content: kedoshim1, mainPassage: kedoshim1MainPassage },
  "kedoshim-2": { content: kedoshim2, mainPassage: kedoshim2MainPassage },
  "kedoshim-3": { content: kedoshim3, mainPassage: kedoshim3MainPassage },
  "moadim-1": { content: moadim1, mainPassage: moadim1MainPassage },
  "moadim-2": { content: moadim2, mainPassage: moadim2MainPassage },
  "moadim-3": { content: moadim3, mainPassage: moadim3MainPassage },
  "brit-1": { content: brit1, mainPassage: brit1MainPassage },
  "brit-2": { content: brit2, mainPassage: brit2MainPassage },
  "shaul-1": { content: shaul1, mainPassage: shaul1MainPassage },
  "shaul-2": { content: shaul2, mainPassage: shaul2MainPassage },
  "shaul-3": { content: shaul3, mainPassage: shaul3MainPassage },
  "melech-1": { content: melech1, mainPassage: melech1MainPassage },
  "melech-2": { content: melech2, mainPassage: melech2MainPassage },
  "melech-3": { content: melech3, mainPassage: melech3MainPassage },
  "batsheva-1": { content: batsheva1, mainPassage: batsheva1MainPassage },
  "batsheva-2": { content: batsheva2, mainPassage: batsheva2MainPassage },
  "batsheva-3": { content: batsheva3, mainPassage: batsheva3MainPassage },
  "batsheva-4": { content: batsheva4, mainPassage: batsheva4MainPassage },
  "avshalom-1": { content: avshalom1, mainPassage: avshalom1MainPassage },
  "avshalom-2": { content: avshalom2, mainPassage: avshalom2MainPassage },
  "avshalom-3": { content: avshalom3, mainPassage: avshalom3MainPassage },
  "avshalom-4": { content: avshalom4, mainPassage: avshalom4MainPassage },
  "mifkad-1": { content: mifkad1, mainPassage: mifkad1MainPassage },
  "mifkad-2": { content: mifkad2, mainPassage: mifkad2MainPassage },
};

export function getTaskContent(ref: string): RegisteredTask | null {
  return TASK_REGISTRY[ref] ?? null;
}

// Curriculum order of a task = its position in the registry (units in study
// order, tasks inside a unit in their `order`). Unknown refs sort last.
const REGISTRY_ORDER = Object.keys(TASK_REGISTRY);
export function taskOrderIndex(ref: string): number {
  const i = REGISTRY_ORDER.indexOf(ref);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

// "משימה 2 מתוך 5 · ויקרא ט״ז" — the unit, the task's number inside it and
// the unit's task count.
export interface TaskPosition {
  unit: string;
  order: number;
  total: number;
}
export function taskPosition(ref: string): TaskPosition | null {
  const reg = TASK_REGISTRY[ref];
  if (!reg?.content.unit) return null;
  const unit = reg.content.unit;
  const siblings = Object.values(TASK_REGISTRY).filter((r) => r.content.unit === unit);
  const order = reg.content.order ?? siblings.indexOf(reg) + 1;
  return { unit, order, total: siblings.length };
}
// Printable versions (public/print/<ref>.pdf + .docx), built by
// scripts/build-print.mts; the manifest says which tasks have them.
export function printFiles(ref: string): { pdf: string; docx: string } | null {
  const m = printManifest as Record<string, { pdf: string; docx: string }>;
  return m[ref] ?? null;
}

export function positionLabel(ref: string): string | null {
  const p = taskPosition(ref);
  return p ? `${p.unit} · משימה ${p.order} מתוך ${p.total}` : null;
}

export type StageInfo = { n: number; title: string; why: string };

// The fixed 7 pshat-decode stages — the iron rule of every FULL task.
// Parallelism is not a stage of its own: it is a genre-specific tool that
// opens inside the genre stage only when שירה/נאום is chosen (or the task
// declares hasParallelism) — most genres simply don't have it.
// (why: one-or-two-word rationale shown to the student.)
export const DECODE_STAGES = [
  { n: 1, title: "מפגש ראשון", why: "קודם פוגשים, אחר־כך מנתחים" },
  { n: 2, title: "מילה מנחה", why: "המפתח שהתורה מניחה לנו" },
  { n: 3, title: "מילים קשות", why: "לדעת מה אני לא יודעת" },
  { n: 4, title: "סוגה", why: "לכל סוגה חוקי קריאה משלה" },
  { n: 5, title: "שאלת שאלות", why: "שאלה טובה = חצי הבנה" },
  { n: 6, title: "מבינים בכל זאת", why: "לא נתקעים על מה שחסר" },
  { n: 7, title: "בדיקת הבנה", why: "לוודא שבאמת הבנתי" },
] as const;

// SIMPLE tasks have NO Part-A stages: the reading happens in class with the
// teacher and a physical Tanach; the site task is the worksheet only (stage 8),
// with the passage available as a reference block on top of it.
export const SIMPLE_STAGES: readonly StageInfo[] = [];

export function isSimple(content: TaskContent): boolean {
  return content.mode === "simple";
}

export function stagesFor(content: TaskContent): readonly StageInfo[] {
  return isSimple(content) ? SIMPLE_STAGES : DECODE_STAGES;
}

// How many Part-A stages a student at `stage` has completed. Stage 8 is
// Part B in both modes, so reaching it means every Part-A stage is done.
export function stagesDone(content: TaskContent, stage: number): number {
  const total = stagesFor(content).length;
  if (stage >= 8) return total;
  return Math.min(Math.max(stage - 1, 0), total);
}

// Count the answerable units of a task (for the progress meter):
// Part-A stages + comprehension answers + every question field in every section.
export function countTaskUnits(reg: RegisteredTask): number {
  let questions = 0;
  for (const section of reg.content.sections) {
    for (const block of section.blocks) {
      if (block.type === "question") {
        questions += block.fields?.length ?? 1;
      }
    }
  }
  return (
    stagesFor(reg.content).length +
    (reg.content.comprehension?.length ?? 0) +
    questions
  );
}
