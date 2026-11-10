// Skill groups for the skills report (issue #29). Pure data + helpers, safe to
// import from client components. To change the mapping, edit SKILL_GROUPS
// (the groups, in display order) and SKILL_RULES (which label goes where).

export interface SkillGroup {
  key: string;
  title: string;
}

export const SKILL_GROUPS: SkillGroup[] = [
  { key: "reading", title: "הבנת הנקרא" },
  { key: "topic", title: "הבנת הנושא והעיקר" },
  { key: "taamim", title: "טעמי המקרא" },
  { key: "orientation", title: "התמצאות בתנ״ך" },
  { key: "language", title: "שפה ומילה מנחה" },
  { key: "argument", title: "טיעון" },
  { key: "other", title: "אחר" },
];

export const OTHER_GROUP = "other";

// A question label belongs to the FIRST rule that matches it. "exact" = the whole
// label (after trimming), "prefix" = the label starts with the text.
// Order matters: the specific "קריאה …" labels come before the bare "קריאה".
export const SKILL_RULES: { group: string; match: "exact" | "prefix"; text: string }[] = [
  // טעמי המקרא (incl. listening / reading aloud)
  { group: "taamim", match: "prefix", text: "טעמי המקרא" },
  { group: "taamim", match: "prefix", text: "קריאה והאזנה" },
  { group: "taamim", match: "prefix", text: "קריאה בקול" },
  // הבנת הנושא והעיקר — "הבנת הנושא · שלב N" and any other label starting so
  { group: "topic", match: "prefix", text: "הבנת הנושא" },
  // הבנת הנקרא
  { group: "reading", match: "prefix", text: "קריאה והבנה" },
  { group: "reading", match: "prefix", text: "חשיבה על הפשט" },
  { group: "reading", match: "prefix", text: "במילים שלי" },
  { group: "reading", match: "exact", text: "קריאה" },
  // התמצאות בתנ״ך — "התמצאות · …" too
  { group: "orientation", match: "prefix", text: "התמצאות" },
  // שפה ומילה מנחה
  { group: "language", match: "prefix", text: "מילה מנחה" },
  { group: "language", match: "prefix", text: "מילה קשה" },
  // טיעון
  { group: "argument", match: "prefix", text: "מיומנות הטיעון" },
  { group: "argument", match: "prefix", text: "מהפסוק לבית הספר" },
];

// a cell needs at least this many scored answers, otherwise it is grey
export const MIN_ANSWERS = 3;
// colour thresholds on the average score
export const RED_BELOW = 55;
export const GREEN_FROM = 75;
// a submission with progress up to this percent counts as empty / nearly empty
export const EMPTY_PROGRESS_PCT = 10;

const norm = (s: string) => s.replace(/[֑-ׇ]/g, "").replace(/["”“]/g, "״").replace(/\s+/g, " ").trim();

export function skillOf(label: string): string {
  const l = norm(label);
  for (const r of SKILL_RULES) {
    const t = norm(r.text);
    if (r.match === "exact" ? l === t : l.startsWith(t)) return r.group;
  }
  return OTHER_GROUP;
}

export type SkillLevel = "red" | "yellow" | "green" | "grey";

export function skillLevel(avg: number | null, n: number): SkillLevel {
  if (avg == null || n < MIN_ANSWERS) return "grey";
  if (avg < RED_BELOW) return "red";
  if (avg < GREEN_FROM) return "yellow";
  return "green";
}

// ---------- report shape (shared by the page, the CSV and the chat tool) ----------

export interface SkillAnswer {
  taskId: number;
  taskTitle: string;
  label: string;
  prompt: string;
  answer: string;
  score: number;
  note: string;
}

export interface SkillCell {
  n: number;
  avg: number | null;
  answers: SkillAnswer[];
}

export interface SkillStudent {
  userId: number;
  name: string;
  klass: string | null;
  cells: Record<string, SkillCell>;
  submitted: number;
  due: number;
  avgMinutes: number | null;
  emptySubmissions: number;
  strongest: string | null; // group key
  weakest: string | null;
}

export interface SkillsReport {
  groups: SkillGroup[];
  tasks: { taskId: number; ref: string; title: string; dueAt: number }[];
  students: SkillStudent[];
  classCells: Record<string, { n: number; avg: number | null; students: number }>;
  unchecked: number; // answers given but not yet checked (not in any average)
}
