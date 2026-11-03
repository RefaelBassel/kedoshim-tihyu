// Types and the average rule of the interim grade (issue #17), shared by the
// server (lib/interim-grades.ts) and the teacher's table. Teacher only.

export interface InterimTask {
  taskId: number;
  ref: string;
  title: string;
  questionCount: number; // visible questions (hidden ones never count)
}

export interface InterimQuestion {
  key: string;
  label: string;
  prompt: string;
  answer: string; // "" = not answered; multi-field answers as "label: value" lines
  score: number | null; // null = waiting for Claude's check
  note: string | null;
}

export interface InterimStudentTask {
  touched: boolean; // at least one visible question answered
  assigned: boolean; // the student was assigned the task (task_assignments)
  questions: InterimQuestion[];
  auto: number | null; // mean of the checked visible questions; null = untouched
  pending: number; // answers not checked yet (new or changed)
  override: number | null;
}

export interface InterimStudent {
  userId: number;
  name: string;
  klass: string | null;
  tasks: Record<number, InterimStudentTask>;
  override: number | null; // the teacher's grade for the whole unit
}

export interface InterimSettings {
  include: number[]; // task ids in the average
  missingAsZero: boolean; // an untouched task counts as 0 (the default since issue #20)
}

export interface InterimGrades {
  scope: string;
  title: string;
  tasks: InterimTask[];
  students: InterimStudent[];
  settings: InterimSettings;
  pending: number;
  checked: number;
  apiAvailable: boolean;
  publishedAt: number | null; // null = not published (the default)
  publishedStale: number; // published grades that differ from the current ones
}

export function taskFinal(t: InterimStudentTask | undefined): number | null {
  if (!t) return null;
  return t.override ?? t.auto;
}

// A task that never counts for this student: not assigned to them (e.g. they
// joined after it was published), no answer in it and no manual grade.
export function notAssigned(t: InterimStudentTask | undefined): boolean {
  return !!t && !t.assigned && !t.touched && t.override == null;
}

// The proposed average: the checked tasks only; an untouched task (no answer
// at all) counts as 0 when the teacher chose so (the default), or is left out.
// A task the student was never assigned is always left out. A whole-unit
// override wins.
export function studentAverage(
  s: InterimStudent,
  settings: InterimSettings
): { auto: number | null; final: number | null; basis: number; of: number; zeros: number; unassigned: number } {
  const included = settings.include;
  let sum = 0;
  let basis = 0;
  let zeros = 0;
  let unassigned = 0;
  for (const id of included) {
    const t = s.tasks[id];
    const v = taskFinal(t);
    if (v != null) {
      sum += v;
      basis++;
    } else if (notAssigned(t)) {
      unassigned++;
    } else if (settings.missingAsZero) {
      basis++;
      zeros++;
    }
  }
  const auto = basis > 0 ? Math.round(sum / basis) : null;
  return { auto, final: s.override ?? auto, basis, of: included.length, zeros, unassigned };
}

// "X משימות מתוך 6, Y נספרו כ-0" — beside the average and in the export
export function basisLabel(a: { basis: number; of: number; zeros: number }): string {
  return `${a.basis} משימות מתוך ${a.of}, ${a.zeros} נספרו כ-0`;
}
