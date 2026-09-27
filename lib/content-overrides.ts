import { db } from "./db";
import type {
  TaskContent,
  TaskSection,
  QuestionBlock,
  QuestionIcon,
  DiscussionQuestion,
  ReviewDeck,
} from "@/content/tasks/types";

// Teacher-editable task content. The TypeScript content files are only the
// DEFAULTS: anything the teacher edits in place is stored here, keyed by the
// content ref, and wins over the file. Reut asked (2026-09-27) to be able to
// change, remove or add questions herself without going through Rafael —
// that is the `worksheet` field. Edits survive republishing a task.

// ---- what can be edited ----
export interface ExtraQuestion {
  sectionKey: string;
  key: string;
  prompt: string;
  label?: string;
  icon?: QuestionIcon;
}
export interface WorksheetEdits {
  hidden: string[]; // question keys removed from the worksheet
  prompts: Record<string, string>; // question key -> new prompt text
  extra: ExtraQuestion[]; // teacher-added questions, appended to their section
}
export interface Overrides {
  worksheet?: WorksheetEdits;
  discussion?: DiscussionQuestion;
  review?: ReviewDeck;
}
export type EditableField = keyof Overrides;
export const EDITABLE_FIELDS: EditableField[] = ["worksheet", "discussion", "review"];

export const EMPTY_EDITS: WorksheetEdits = { hidden: [], prompts: {}, extra: [] };

let ready = false;
export async function ensureOverridesTable() {
  if (ready) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS task_content_overrides (
       content_ref TEXT NOT NULL,
       field TEXT NOT NULL,
       value_json TEXT NOT NULL,
       updated_at INTEGER NOT NULL,
       updated_by INTEGER,
       PRIMARY KEY (content_ref, field)
     )`
  );
  ready = true;
}

export async function getOverrides(contentRef: string): Promise<Overrides> {
  await ensureOverridesTable();
  const res = await db().execute({
    sql: "SELECT field, value_json FROM task_content_overrides WHERE content_ref = ?",
    args: [contentRef],
  });
  const out: Record<string, unknown> = {};
  for (const r of res.rows) {
    const field = String(r.field);
    if (!EDITABLE_FIELDS.includes(field as EditableField)) continue;
    try {
      out[field] = JSON.parse(String(r.value_json));
    } catch {
      /* a corrupt row — the file default stands */
    }
  }
  return out as Overrides;
}

export async function setOverride(
  contentRef: string,
  field: EditableField,
  value: unknown,
  userId: number
) {
  await ensureOverridesTable();
  await db().execute({
    sql: `INSERT INTO task_content_overrides (content_ref, field, value_json, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(content_ref, field) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by`,
    args: [contentRef, field, JSON.stringify(value), Math.floor(Date.now() / 1000), userId],
  });
}

export async function clearOverride(contentRef: string, field: EditableField) {
  await ensureOverridesTable();
  await db().execute({
    sql: "DELETE FROM task_content_overrides WHERE content_ref = ? AND field = ?",
    args: [contentRef, field],
  });
}

// ---- applying the edits ----

export function applyWorksheetEdits(
  sections: TaskSection[],
  edits: WorksheetEdits | undefined
): TaskSection[] {
  if (!edits) return sections;
  const hidden = new Set(edits.hidden);
  return sections.map((sec) => {
    const blocks = sec.blocks
      .filter((b) => b.type !== "question" || !hidden.has(b.key))
      .map((b) =>
        b.type === "question" && edits.prompts[b.key]
          ? { ...b, prompt: edits.prompts[b.key] }
          : b
      );
    const extras: QuestionBlock[] = edits.extra
      .filter((e) => e.sectionKey === sec.key && !hidden.has(e.key))
      .map((e) => ({
        type: "question",
        key: e.key,
        icon: e.icon ?? "thinking",
        label: e.label ?? "שאלה של המורה",
        prompt: edits.prompts[e.key] ?? e.prompt,
      }));
    return { ...sec, blocks: [...blocks, ...extras] };
  });
}

export function applyOverrides(content: TaskContent, ov: Overrides): TaskContent {
  return {
    ...content,
    sections: applyWorksheetEdits(content.sections, ov.worksheet),
    discussion: ov.discussion ?? content.discussion,
    review: ov.review ?? content.review,
  };
}

export async function effectiveContent(content: TaskContent): Promise<TaskContent> {
  return applyOverrides(content, await getOverrides(content.ref));
}

// ---- server-side validation of teacher edits ----

const str = (v: unknown, max = 2000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export function sanitizeField(field: EditableField, raw: unknown): unknown | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  switch (field) {
    case "worksheet": {
      const hidden = Array.isArray(o.hidden)
        ? [...new Set(o.hidden.map((k) => str(k, 80)).filter(Boolean))]
        : [];
      const prompts: Record<string, string> = {};
      if (o.prompts && typeof o.prompts === "object") {
        for (const [k, v] of Object.entries(o.prompts as Record<string, unknown>)) {
          const p = str(v, 1500);
          if (k && p) prompts[str(k, 80)] = p;
        }
      }
      const extra: ExtraQuestion[] = [];
      if (Array.isArray(o.extra)) {
        for (const e of o.extra.slice(0, 40)) {
          const x = (e ?? {}) as Record<string, unknown>;
          const sectionKey = str(x.sectionKey, 80);
          const key = str(x.key, 80);
          const prompt = str(x.prompt, 1500);
          if (!sectionKey || !key || !prompt) continue;
          extra.push({
            sectionKey,
            key,
            prompt,
            label: str(x.label, 80) || undefined,
            icon: typeof x.icon === "string" ? (x.icon as QuestionIcon) : undefined,
          });
        }
      }
      return { hidden, prompts, extra } satisfies WorksheetEdits;
    }
    case "discussion": {
      const question = str(o.question, 800);
      if (!question) return null;
      const teacherNote = str(o.teacherNote, 600);
      return teacherNote ? { question, teacherNote } : { question };
    }
    case "review": {
      const points = Array.isArray(o.points)
        ? o.points.map((p) => str(p, 300)).filter(Boolean).slice(0, 6)
        : [];
      if (points.length === 0) return null;
      const skill = str(o.skill, 200);
      return skill ? { points, skill } : { points };
    }
  }
}
