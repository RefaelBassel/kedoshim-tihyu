// אמנת הכיתה — the class charter built unit by unit (issue #27). Types,
// status labels/colours and the input cleaner, usable on server and client
// alike; the storage lives in lib/amana.ts.

export type ClauseStatus = "draft" | "discussion" | "presented" | "approved";
export const CLAUSE_STATUSES: ClauseStatus[] = ["draft", "discussion", "presented", "approved"];

export const CLAUSE_STATUS_META: Record<ClauseStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "טיוטה", color: "#6b6055", bg: "#f0e9e1" },
  discussion: { label: "בדיון בכיתה", color: "#8a6516", bg: "#fdf3d7" },
  presented: { label: "הוצג להנהלה", color: "#2f5d8a", bg: "#e3edf7" },
  approved: { label: "אושר", color: "#3e6b4f", bg: "#e5efe8" },
};

export interface Clause {
  id: number;
  position: number; // 1-based number in the charter
  text: string;
  verseQuote: string;
  verseSource: string; // e.g. "ויקרא ה׳, כ״ג"
  unitRef: string | null; // the task ref the clause was born in (e.g. nedava-3)
  status: ClauseStatus;
  teacherNote: string; // shown to students under the clause (optional)
  adminNotes: string; // notes from the meeting with the school management (teacher only)
  clauseDate: string; // YYYY-MM-DD
  proposedBy: string; // optional student names, shown only when filled
  createdAt: number;
}

// What a student may see of a clause (no meeting notes).
export type PublicClause = Omit<Clause, "adminNotes">;
export function publicClause(c: Clause): PublicClause {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminNotes, ...rest } = c;
  return rest;
}

export type ClauseInput = Partial<Omit<Clause, "id" | "position" | "createdAt">>;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

// Accepts anything (a request body, a chat tool input) and keeps only the
// known fields, trimmed and capped. Missing fields stay missing (a patch).
export function cleanClauseInput(raw: unknown): ClauseInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: ClauseInput = {};
  const text = clip(r.text, 600);
  if (text !== undefined) out.text = text;
  const q = clip(r.verseQuote, 400);
  if (q !== undefined) out.verseQuote = q;
  const s = clip(r.verseSource, 120);
  if (s !== undefined) out.verseSource = s;
  if (r.unitRef === null || r.unitRef === "") out.unitRef = null;
  else {
    const u = clip(r.unitRef, 80);
    if (u !== undefined) out.unitRef = u;
  }
  if (typeof r.status === "string" && (CLAUSE_STATUSES as string[]).includes(r.status)) out.status = r.status as ClauseStatus;
  const tn = clip(r.teacherNote, 1000);
  if (tn !== undefined) out.teacherNote = tn;
  const an = clip(r.adminNotes, 3000);
  if (an !== undefined) out.adminNotes = an;
  const d = clip(r.clauseDate, 10);
  if (d !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(d)) out.clauseDate = d;
  const pb = clip(r.proposedBy, 300);
  if (pb !== undefined) out.proposedBy = pb;
  return out;
}

// "2026-11-07" → "7.11.2026"
export function formatClauseDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : d;
}

// The label that marks a worksheet question as a charter question: its
// answer is collected as a proposal for the unit's clause.
export const CHARTER_LABEL = "מהפסוק לבית הספר · אמנת הכיתה";
export function isCharterLabel(label: string | undefined): boolean {
  if (!label) return false;
  return label.includes("אמנת הכיתה") || label.includes("מהפסוק לבית הספר");
}

// Plain-text export of clauses (for designing the charter in another tool).
export function charterText(clauses: Clause[] | PublicClause[], title = "אמנת הכיתה — קדושים תהיו"): string {
  const lines = [title, ""];
  clauses.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.text}`);
    if (c.verseQuote || c.verseSource) {
      lines.push(`   ${c.verseQuote ? `״${c.verseQuote}״` : ""}${c.verseSource ? ` (${c.verseSource})` : ""}`.trimEnd());
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}
