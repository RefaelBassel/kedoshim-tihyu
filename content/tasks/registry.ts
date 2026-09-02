import type { TaskContent, PassageBlock } from "./types";
import { vayikra16a, vayikra16aMainPassage } from "./vayikra-16-1";
import { vayikra16b, vayikra16bMainPassage } from "./vayikra-16-2";
import { vayikra16c, vayikra16cMainPassage } from "./vayikra-16-3";
import { vayikra16d, vayikra16dMainPassage } from "./vayikra-16-4";
import { vayikra16e, vayikra16eMainPassage } from "./vayikra-16-5";

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
