import { db } from "./db";
import { allStudents, now } from "./tasks";
import { effectiveContent } from "./content-overrides";
import { getTaskContent } from "@/content/tasks/registry";
import type { QuestionBlock } from "@/content/tasks/types";
import { answerText, hashAnswer } from "./interim-grades";
import {
  EMPTY_PROGRESS_PCT,
  MIN_ANSWERS,
  OTHER_GROUP,
  SKILL_GROUPS,
  skillOf,
  type SkillAnswer,
  type SkillCell,
  type SkillStudent,
  type SkillsReport,
} from "./skills-map";

// Skills report (issue #29): per student and skill group, the mean of Claude's
// lenient answer checks (interim_answer_grades) across every published task.
// Only checked answers count; unanswered or not-yet-checked ones stay out.
// Teacher only — every caller checks the role.

export interface SkillsFilter {
  refs?: string[]; // unit content refs; empty = all
  from?: number; // unix, task due date
  to?: number;
}

export async function skillsReport(filter: SkillsFilter = {}): Promise<SkillsReport> {
  const t0 = now();
  const taskRes = await db().execute({ sql: "SELECT id, content_ref, title, due_at FROM tasks ORDER BY due_at", args: [] });
  const cancelled = new Set<number>();
  try {
    const c = await db().execute("SELECT task_id FROM task_cancellations");
    for (const r of c.rows) cancelled.add(Number(r.task_id));
  } catch {
    /* table not created yet — nothing cancelled */
  }
  const refs = filter.refs?.length ? new Set(filter.refs) : null;
  const picked = taskRes.rows
    .map((r) => ({ taskId: Number(r.id), ref: String(r.content_ref), title: String(r.title), dueAt: Number(r.due_at) }))
    .filter((t) => !cancelled.has(t.taskId) && (!refs || refs.has(t.ref)) && (filter.from == null || t.dueAt >= filter.from) && (filter.to == null || t.dueAt <= filter.to));

  const tasks: { taskId: number; ref: string; title: string; dueAt: number; questions: QuestionBlock[] }[] = [];
  for (const t of picked) {
    const reg = getTaskContent(t.ref);
    if (!reg) continue;
    const content = await effectiveContent(reg.content);
    tasks.push({ ...t, questions: content.sections.flatMap((s) => s.blocks.filter((b): b is QuestionBlock => b.type === "question")) });
  }

  const students = await allStudents();
  const ids = tasks.map((t) => t.taskId);
  const marks = ids.map(() => "?").join(",");
  const answers = new Map<string, Map<string, string>>();
  const checks = new Map<string, { hash: string; score: number; note: string }>();
  const assigned = new Set<string>();
  const progress = new Map<string, { sec: number; pct: number; submitted: boolean }>();
  if (ids.length) {
    const ar = await db().execute({ sql: `SELECT task_id, user_id, question_key, answer FROM task_answers WHERE task_id IN (${marks})`, args: ids });
    for (const r of ar.rows) {
      const k = `${r.task_id}:${r.user_id}`;
      if (!answers.has(k)) answers.set(k, new Map());
      answers.get(k)!.set(String(r.question_key), String(r.answer ?? ""));
    }
    try {
      const gr = await db().execute({ sql: `SELECT task_id, user_id, question_key, answer_hash, score, note FROM interim_answer_grades WHERE task_id IN (${marks})`, args: ids });
      for (const r of gr.rows) checks.set(`${r.task_id}:${r.user_id}:${r.question_key}`, { hash: String(r.answer_hash), score: Number(r.score), note: String(r.note) });
    } catch {
      /* no check was ever run — no scores */
    }
    const asg = await db().execute({ sql: `SELECT task_id, user_id FROM task_assignments WHERE task_id IN (${marks})`, args: ids });
    for (const r of asg.rows) assigned.add(`${r.task_id}:${r.user_id}`);
    const pr = await db().execute({ sql: `SELECT task_id, user_id, work_seconds, progress_pct, submitted_at FROM task_progress WHERE task_id IN (${marks})`, args: ids });
    for (const r of pr.rows) progress.set(`${r.task_id}:${r.user_id}`, { sec: Number(r.work_seconds ?? 0), pct: Number(r.progress_pct ?? 0), submitted: r.submitted_at != null });
  }

  let unchecked = 0;
  const rows: SkillStudent[] = students.map((s) => {
    const cells: Record<string, SkillCell> = {};
    for (const g of SKILL_GROUPS) cells[g.key] = { n: 0, avg: null, answers: [] };
    let submitted = 0;
    let due = 0;
    let sec = 0;
    let subs = 0;
    let empty = 0;
    for (const t of tasks) {
      const k = `${t.taskId}:${s.id}`;
      const p = progress.get(k);
      if (assigned.has(k) && t.dueAt <= t0) {
        due++;
        if (p?.submitted) submitted++;
      }
      if (p?.submitted) {
        subs++;
        sec += p.sec;
        if (p.pct <= EMPTY_PROGRESS_PCT) empty++;
      }
      const a = answers.get(k);
      if (!a) continue;
      for (const q of t.questions) {
        const text = answerText(q, a);
        if (!text) continue;
        const c = checks.get(`${k}:${q.key}`);
        if (!c || c.hash !== hashAnswer(text)) {
          unchecked++;
          continue;
        }
        const entry: SkillAnswer = { taskId: t.taskId, taskTitle: t.title, label: q.label, prompt: q.prompt, answer: text, score: c.score, note: c.note };
        cells[skillOf(q.label)].answers.push(entry);
      }
    }
    for (const g of SKILL_GROUPS) {
      const c = cells[g.key];
      c.n = c.answers.length;
      c.avg = c.n ? Math.round(c.answers.reduce((x, y) => x + y.score, 0) / c.n) : null;
    }
    const ranked = SKILL_GROUPS.filter((g) => g.key !== OTHER_GROUP && cells[g.key].n >= MIN_ANSWERS && cells[g.key].avg != null);
    ranked.sort((x, y) => cells[y.key].avg! - cells[x.key].avg!);
    return {
      userId: s.id,
      name: s.fullName,
      klass: s.klass,
      cells,
      submitted,
      due,
      avgMinutes: subs ? Math.round(sec / subs / 60) : null,
      emptySubmissions: empty,
      strongest: ranked.length ? ranked[0].key : null,
      weakest: ranked.length > 1 ? ranked[ranked.length - 1].key : null,
    };
  });

  const classCells: SkillsReport["classCells"] = {};
  for (const g of SKILL_GROUPS) {
    let n = 0;
    let sum = 0;
    let st = 0;
    for (const r of rows) {
      const c = r.cells[g.key];
      if (c.n) {
        n += c.n;
        sum += c.answers.reduce((x, y) => x + y.score, 0);
        st++;
      }
    }
    classCells[g.key] = { n, avg: n ? Math.round(sum / n) : null, students: st };
  }

  return {
    groups: SKILL_GROUPS,
    tasks: tasks.map(({ taskId, ref, title, dueAt }) => ({ taskId, ref, title, dueAt })),
    students: rows,
    classCells,
    unchecked,
  };
}
