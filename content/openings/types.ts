// מצגת פתיחה — a short (3–5 minute) cinematic opening the teacher projects
// at the start of a unit's lesson. Generic player (components/opening-deck.tsx),
// content defined per unit here. Every slide kind has a fixed number of
// in-slide clicks ("steps") before the deck moves on.

export type OpeningSlide =
  // dark, the lines rise one after another by themselves; the finale is a
  // verse quote (font-mikra) with its source
  | { kind: "reveal"; lines: string[]; finale?: { quote: string; source: string } }
  // an open question for a show of hands — no answer on the screen
  | { kind: "question"; eyebrow: string; facts: { big: string; text: string }[]; ask: string; note?: string }
  // "who finds it first?": click starts the timer, another click reveals the answer
  | { kind: "challenge"; eyebrow: string; instruction: string; quote: string; seconds: number; answer: string }
  // the chapter as one bar filling part after part, one click each
  | { kind: "map"; eyebrow: string; heading: string; from: string; to: string; parts: string[] }
  // the hand-off to the lesson itself
  | { kind: "launch"; title: string; sub?: string };

export interface OpeningDeck {
  ref: string;
  slides: OpeningSlide[];
}

// clicks a slide consumes before the deck moves to the next slide
export function slideSteps(s: OpeningSlide): number {
  switch (s.kind) {
    case "challenge":
      return 2; // start the timer, reveal the answer
    case "map":
      return s.parts.length;
    default:
      return 0;
  }
}
