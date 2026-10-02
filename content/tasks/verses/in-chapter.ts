import type { PassageVerse } from "../types";

// Prefix every verse number with its chapter ("י״ז, א") — the passage
// renderer shows such numbers as a prominent "פרק · פסוק" chip, so a list
// that splices several chapters stays unmistakable, and verse keys stay unique.
export function inChapter(chapter: string, vs: PassageVerse[]): PassageVerse[] {
  return vs.map((v) => ({ ...v, num: `${chapter}, ${v.num}` }));
}
