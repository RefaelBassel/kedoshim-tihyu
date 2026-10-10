import type { OpeningDeck } from "./types";
import { vayikra16eOpening } from "./vayikra-16-5";

// Units that have an opening deck, by content ref. Add a unit here and the
// "▶ פתיחה" button appears on its lesson card and its dashboard task page.
const OPENINGS: Record<string, OpeningDeck> = {
  [vayikra16eOpening.ref]: vayikra16eOpening,
};

export function getOpening(ref: string): OpeningDeck | null {
  return OPENINGS[ref] ?? null;
}

export function hasOpening(ref: string): boolean {
  return ref in OPENINGS;
}
