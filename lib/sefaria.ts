// Sefaria integration — hyper-linking and (later) text fetching, STRICTLY
// scoped to the curriculum: only the chapters in the annual program, and
// only the program's commentators.

// Hebrew-interface Sefaria links.
const SEFARIA_BASE = "https://www.sefaria.org.il";

export function sefariaUrl(ref: string): string {
  return `${SEFARIA_BASE}/${encodeURIComponent(ref).replace(/%2C/g, ",")}?lang=he`;
}

// ---- Curriculum allowlist ----

// ספר ויקרא — the chapters in the annual plan.
// (טז first — עבודת הכהן הגדול ביום הכיפורים; then א–ה, ז; ח–י; יא–יד; יח; יט;
//  כג, כה; כו.)
export const LEVITICUS_CHAPTERS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 23, 25, 26];

// שמואל ב — the units in the annual plan.
export const SAMUEL_II_CHAPTERS = [1, 2, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17, 18, 19, 24];

// Commentators in the program.
export const ALLOWED_COMMENTATOR_PREFIXES = [
  "Rashi_on_Leviticus.",
  "Ramban_on_Leviticus.",
  "Rashbam_on_Leviticus.",
  "Ibn_Ezra_on_Leviticus.",
  "Sefer_HaChinukh.",
  "Rashi_on_II_Samuel.",
  "Radak_on_II_Samuel.",
];

// Is this Sefaria ref inside the curriculum scope?
export function isAllowedRef(ref: string): boolean {
  const lev = ref.match(/^Leviticus\.(\d+)/);
  if (lev) return LEVITICUS_CHAPTERS.includes(Number(lev[1]));

  const sam2 = ref.match(/^II_Samuel\.(\d+)/);
  if (sam2) return SAMUEL_II_CHAPTERS.includes(Number(sam2[1]));

  return ALLOWED_COMMENTATOR_PREFIXES.some((p) => ref.startsWith(p));
}

// Safe URL builder: returns null for refs outside the curriculum, so nothing
// in the UI ever links beyond the program's scope.
export function curriculumUrl(ref: string | undefined): string | null {
  if (!ref || !isAllowedRef(ref)) return null;
  return sefariaUrl(ref);
}

// Server-side text fetch (Sefaria API v3) — for building future tasks and
// on-demand source display. Curriculum-scoped like everything else.
export async function fetchSefariaText(
  ref: string
): Promise<{ he: string[]; ref: string } | null> {
  if (!isAllowedRef(ref)) return null;
  try {
    const res = await fetch(
      `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew`,
      { next: { revalidate: 60 * 60 * 24 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.versions?.[0]?.text;
    const flat: string[] = Array.isArray(text) ? text.flat(3) : [String(text ?? "")];
    return { he: flat.filter(Boolean).map(String), ref };
  } catch {
    return null;
  }
}
