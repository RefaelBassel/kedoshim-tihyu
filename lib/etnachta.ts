import { VAYIKRA_16 } from "@/content/tasks/vayikra-16-verses";

// Pure helpers (no server imports) shared by the exam code and the
// student-facing preparation page.
const ETNACHTA = "֑";

export function verseByNum(num: string): string | null {
  const clean = num.replace(/[״׳]/g, "");
  return VAYIKRA_16.find((v) => v.num.replace(/[״׳]/g, "") === clean)?.text ?? null;
}

// the word that carries the etnachta, and the two halves of the verse
export function etnachtaSplit(verse: string): { word: string; first: string; second: string } | null {
  const words = verse.split(/\s+/);
  const i = words.findIndex((w) => w.includes(ETNACHTA));
  if (i < 0) return null;
  return { word: words[i], first: words.slice(0, i + 1).join(" "), second: words.slice(i + 1).join(" ") };
}
