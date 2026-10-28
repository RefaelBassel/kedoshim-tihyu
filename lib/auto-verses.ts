import type { PassageBlock, PassageVerse, QuestionBlock, TaskContent } from "@/content/tasks/types";
import { formatVerseNums, isNoVerses, numOf, parseVerseSpec } from "./verse-spec";
import { gematria } from "./hebrew";
import { inChapter } from "@/content/tasks/verses/in-chapter";
import { VAYIKRA_16 } from "@/content/tasks/vayikra-16-verses";
import { LEVITICUS_1 } from "@/content/tasks/verses/leviticus-01";
import { LEVITICUS_2 } from "@/content/tasks/verses/leviticus-02";
import { LEVITICUS_3 } from "@/content/tasks/verses/leviticus-03";
import { LEVITICUS_5 } from "@/content/tasks/verses/leviticus-05";
import { LEVITICUS_7 } from "@/content/tasks/verses/leviticus-07";
import { LEVITICUS_8 } from "@/content/tasks/verses/leviticus-08";
import { LEVITICUS_9 } from "@/content/tasks/verses/leviticus-09";
import { LEVITICUS_10 } from "@/content/tasks/verses/leviticus-10";
import { LEVITICUS_11 } from "@/content/tasks/verses/leviticus-11";
import { LEVITICUS_13 } from "@/content/tasks/verses/leviticus-13";
import { LEVITICUS_14 } from "@/content/tasks/verses/leviticus-14";
import { LEVITICUS_18 } from "@/content/tasks/verses/leviticus-18";
import { LEVITICUS_19 } from "@/content/tasks/verses/leviticus-19";
import { LEVITICUS_23 } from "@/content/tasks/verses/leviticus-23";
import { LEVITICUS_25 } from "@/content/tasks/verses/leviticus-25";
import { LEVITICUS_26 } from "@/content/tasks/verses/leviticus-26";
import { II_SAMUEL_1 } from "@/content/tasks/verses/ii-samuel-01";
import { II_SAMUEL_2 } from "@/content/tasks/verses/ii-samuel-02";
import { II_SAMUEL_5 } from "@/content/tasks/verses/ii-samuel-05";
import { II_SAMUEL_6 } from "@/content/tasks/verses/ii-samuel-06";
import { II_SAMUEL_7 } from "@/content/tasks/verses/ii-samuel-07";
import { II_SAMUEL_11 } from "@/content/tasks/verses/ii-samuel-11";
import { II_SAMUEL_12 } from "@/content/tasks/verses/ii-samuel-12";
import { II_SAMUEL_13 } from "@/content/tasks/verses/ii-samuel-13";
import { II_SAMUEL_14 } from "@/content/tasks/verses/ii-samuel-14";
import { II_SAMUEL_15 } from "@/content/tasks/verses/ii-samuel-15";
import { II_SAMUEL_16 } from "@/content/tasks/verses/ii-samuel-16";
import { II_SAMUEL_17 } from "@/content/tasks/verses/ii-samuel-17";
import { II_SAMUEL_18 } from "@/content/tasks/verses/ii-samuel-18";
import { II_SAMUEL_19 } from "@/content/tasks/verses/ii-samuel-19";
import { II_SAMUEL_24 } from "@/content/tasks/verses/ii-samuel-24";

// Automatic verses beside a worksheet question (issue #21): a question with
// no pinned `verses` whose wording names verses ("פסוק ה׳", "פסוקים ג׳–ז׳",
// "פרק ז׳, פסוקים י״א–י״ח") gets those verses in its box. Server side only — the
// chapter texts never reach the browser bundle; the task page passes the
// resolved passages down. Questions that already carry verses of their own
// (`verses`, `helpVerses`, `versesNote`), orientation questions (finding the
// verse in a physical Tanach is the exercise) and `verses: "none"` get none.

// every chapter text the site has, by Sefaria book id and chapter number
const CHAPTERS: Record<string, Record<number, PassageVerse[]>> = {
  Leviticus: {
    1: LEVITICUS_1, 2: LEVITICUS_2, 3: LEVITICUS_3, 5: LEVITICUS_5, 7: LEVITICUS_7,
    8: LEVITICUS_8, 9: LEVITICUS_9, 10: LEVITICUS_10, 11: LEVITICUS_11, 13: LEVITICUS_13,
    14: LEVITICUS_14, 16: VAYIKRA_16, 18: LEVITICUS_18, 19: LEVITICUS_19, 23: LEVITICUS_23,
    25: LEVITICUS_25, 26: LEVITICUS_26,
  },
  II_Samuel: {
    1: II_SAMUEL_1, 2: II_SAMUEL_2, 5: II_SAMUEL_5, 6: II_SAMUEL_6, 7: II_SAMUEL_7,
    11: II_SAMUEL_11, 12: II_SAMUEL_12, 13: II_SAMUEL_13, 14: II_SAMUEL_14, 15: II_SAMUEL_15,
    16: II_SAMUEL_16, 17: II_SAMUEL_17, 18: II_SAMUEL_18, 19: II_SAMUEL_19, 24: II_SAMUEL_24,
  },
};

const BOOK_LABEL: Record<string, string> = { Leviticus: "ויקרא", II_Samuel: "שמואל ב" };

// "find / leaf through / look up" — the student is meant to search alone
const ORIENTATION_RE = /(^|[\s(״"])(מצאו|מצא|מצאי|דפדפו|דפדף|דפדפי|חפשו|חפש|חפשי|חיפשו)(?=[\s,.:!?)]|$)/;

// one verse number as written in a prompt: "ה׳", "כ״ג", "23" — the geresh is
// required, so ordinary words ("פסוק זה") are never read as numbers
const NUM = String.raw`(?:[א-ת]{1,2}["״][א-ת]|[א-ת]['׳]|\d{1,3})`;
const RANGE = String.raw`${NUM}(?:\s*[–—-]\s*${NUM})?`;
const SPEC = String.raw`${RANGE}(?:\s*(?:,|ו[־-]?|ועד)\s*${RANGE})*`;
const CHAP = String.raw`(?:${NUM}|[א-ת]{1,3}(?=\s*,))`;
const CITE_RE = new RegExp(
  String.raw`(?:פרק\s+(${CHAP})\s*,?\s*)?פסוק(?:ים)?\s+(${SPEC})`,
  "g"
);

interface Cite {
  chapter: number;
  nums: number[];
}

// the verses a text names, grouped by chapter; `main` = the unit's chapter,
// used when a mention names no chapter (null for multi-chapter units). A
// bare mention after "פרק ז׳, פסוקים…" belongs to that chapter.
function citesOf(text: string, main: number | null): Cite[] {
  const byChapter = new Map<number, Set<number>>();
  let current = main;
  for (const m of text.matchAll(CITE_RE)) {
    if (m[1]) current = numOf(m[1]);
    const chapter = current;
    if (!chapter) continue;
    const spec = m[2].replace(/\s*ועד\s*/g, "–").replace(/\s+ו[־-]?(?=\S)/g, ", ");
    const { nums, error } = parseVerseSpec(spec);
    if (error || !nums.length) continue;
    const set = byChapter.get(chapter) ?? new Set<number>();
    nums.forEach((n) => set.add(n));
    byChapter.set(chapter, set);
  }
  return [...byChapter].map(([chapter, set]) => ({ chapter, nums: [...set].sort((a, b) => a - b) }));
}

function pick(chapter: PassageVerse[], nums: number[]): PassageVerse[] {
  const byNum = new Map<number, PassageVerse>();
  for (const v of chapter) {
    if (v.num.includes(",")) continue;
    const n = numOf(v.num);
    if (n != null) byNum.set(n, v);
  }
  return nums.map((n) => byNum.get(n)).filter((v): v is PassageVerse => !!v);
}

export function isOrientationQuestion(q: QuestionBlock): boolean {
  return ORIENTATION_RE.test(q.prompt);
}

// question key → the passage to show beside it
export function autoVersesFor(content: TaskContent, mainPassage: PassageBlock): Record<string, PassageBlock> {
  const m = (mainPassage.sefariaRef ?? "").match(/^([A-Za-z_]+)\.(\d+)/);
  if (!m) return {};
  const book = m[1];
  const chapters = CHAPTERS[book] ?? {};
  // a unit whose main passage splices chapters ("ב, א") has no single
  // chapter to read a bare "פסוק ג׳" against
  const multi = mainPassage.verses.some((v) => v.num.includes(","));
  const main = multi ? null : Number(m[2]);
  const out: Record<string, PassageBlock> = {};
  for (const section of content.sections) {
    for (const b of section.blocks) {
      if (b.type !== "question") continue;
      if (b.verses?.trim() || isNoVerses(b.verses) || b.helpVerses || b.versesNote) continue;
      if (b.icon === "orientation" || isOrientationQuestion(b)) continue;
      const cites = citesOf(b.prompt, main);
      if (!cites.length) continue;
      const parts: { chapter: number; nums: number[]; verses: PassageVerse[] }[] = [];
      for (const c of cites) {
        const text = chapters[c.chapter] ?? (c.chapter === main ? mainPassage.verses : null);
        if (!text) continue;
        const verses = pick(text, c.nums);
        if (verses.length) parts.push({ ...c, nums: c.nums.filter((n) => verses.some((v) => numOf(v.num) === n)), verses });
      }
      if (!parts.length) continue;
      const label = BOOK_LABEL[book] ?? book;
      const one = parts.length === 1 && parts[0].chapter === main;
      out[b.key] = {
        type: "passage",
        key: `av-${b.key}`,
        ref: parts.map((p, i) => `${i === 0 ? `${label} ` : ""}${gematria(p.chapter)}, ${formatVerseNums(p.nums)}`).join("; "),
        // another chapter (or several) → "ז, י״א" numbers, so the renderer
        // shows the chapter chip and the audio resolves the right chapter
        verses: one
          ? parts[0].verses
          : parts.flatMap((p) => inChapter(gematria(p.chapter), p.verses)),
        sefariaRef: one ? mainPassage.sefariaRef : `${book}.${parts[0].chapter}`,
      };
    }
  }
  return out;
}
