import type { PassageVerse } from "@/content/tasks/types";
import { gematria } from "./hebrew";

// Verse specs: the short Hebrew way a teacher names verses of the unit's
// chapter — "ט״ז–כ׳", "ד׳, כ״ג–כ״ד, ל״ב". Used to pin the relevant verses next
// to a worksheet question (or one of its fields). Pure — shared by the task
// page, the teacher's editor, the API sanitizer and the teacher chat.

const LETTERS: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100,
};

// "כ״ג" / "כג" / "23" → 23; anything else → null
export function numOf(raw: string): number | null {
  const s = raw.replace(/[׳״'"]/g, "").replace(/^פסוק(ים)?\s*/, "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s) || null;
  let sum = 0;
  for (const ch of s) {
    const v = LETTERS[ch];
    if (!v) return null;
    sum += v;
  }
  return sum || null;
}

export interface ParsedSpec {
  nums: number[]; // sorted, unique, 1-based
  error?: string; // Hebrew, for the teacher
  none?: boolean; // deliberately no verses (NO_VERSES)
}

// A deliberate "no verses box" — turns off the automatic verses a question
// would get from its wording (lib/auto-verses.ts), e.g. on an orientation
// question where finding the verse IS the exercise. Stored as "none".
export const NO_VERSES = "none";
export function isNoVerses(spec: string | undefined | null): boolean {
  return /^\s*(none|ללא|בלי|בלי פסוקים|אין)\s*$/i.test(spec ?? "");
}

// max = the chapter's verse count (omit to check syntax only)
export function parseVerseSpec(spec: string, max?: number): ParsedSpec {
  const text = spec.trim();
  if (!text) return { nums: [] };
  if (isNoVerses(text)) return { nums: [], none: true };
  const set = new Set<number>();
  for (const part of text.split(/[,،;]+/)) {
    const p = part.trim();
    if (!p) continue;
    const ends = p.split(/\s*[–—-]\s*/);
    if (ends.length > 2) return { nums: [], error: `לא הבנתי את ״${p}״` };
    const a = numOf(ends[0]);
    const b = ends.length === 2 ? numOf(ends[1]) : a;
    if (a == null || b == null) return { nums: [], error: `לא הבנתי את ״${p}״` };
    if (b < a) return { nums: [], error: `בטווח ״${p}״ הסוף לפני ההתחלה` };
    if (max != null && b > max) return { nums: [], error: `בפרק יש רק ${gematria(max)} פסוקים` };
    if (b - a > 200) return { nums: [], error: `הטווח ״${p}״ ארוך מדי` };
    for (let n = a; n <= b; n++) set.add(n);
  }
  return { nums: [...set].sort((x, y) => x - y) };
}

// [4, 23, 24, 32] → "ד׳, כ״ג–כ״ד, ל״ב"
export function formatVerseNums(nums: number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j === i ? gematria(nums[i]) : `${gematria(nums[i])}–${gematria(nums[j])}`);
    i = j + 1;
  }
  return out.join(", ");
}

// the canonical spelling of a spec, or null when it does not parse
export function normalizeVerseSpec(spec: string, max?: number): string | null {
  const p = parseVerseSpec(spec, max);
  if (p.none) return NO_VERSES;
  return p.error ? null : formatVerseNums(p.nums);
}

// The verses of the chapter a spec names. Only plain verse numbers ("א",
// "טז") are addressable — multi-chapter passages ("ט׳, א׳") are skipped.
export function versesForSpec(spec: string, chapter: PassageVerse[]): PassageVerse[] {
  const byNum = new Map<number, PassageVerse>();
  for (const v of chapter) {
    if (v.num.includes(",")) continue;
    const n = numOf(v.num);
    if (n != null) byNum.set(n, v);
  }
  return parseVerseSpec(spec).nums.map((n) => byNum.get(n)).filter((v): v is PassageVerse => !!v);
}

// the highest plain verse number in a chapter (for validation)
export function chapterLength(chapter: PassageVerse[]): number {
  let max = 0;
  for (const v of chapter) {
    if (v.num.includes(",")) continue;
    max = Math.max(max, numOf(v.num) ?? 0);
  }
  return max;
}

// "ויקרא, פרק ט״ז — הפרק כולו" → "ויקרא ט״ז": the label in front of a spec
export function chapterLabel(passageRef: string): string {
  const m = passageRef.match(/^\s*([^,—–(]+?)\s*,?\s*פרק\s+([א-ת׳״'"]+)/);
  return m ? `${m[1]} ${m[2]}` : passageRef.split(/[—–(]/)[0].trim();
}
