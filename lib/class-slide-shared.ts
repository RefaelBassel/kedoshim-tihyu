// The class slide document — types, the default, and the cleaner (server and
// client alike; the storage lives in lib/class-slide.ts).

export type SlideBlockKey = "task" | "rules" | "done";
export const SLIDE_BLOCK_KEYS: SlideBlockKey[] = ["task", "rules", "done"];
export const SLIDE_BLOCK_ICON: Record<SlideBlockKey, string> = { task: "📝", rules: "📏", done: "🏠" };

export interface SlideBlock {
  heading: string;
  lines: string[];
}
export interface SlideDoc {
  title: string;
  blocks: Record<SlideBlockKey, SlideBlock>;
  footer: string;
}

export const DEFAULT_SLIDE: SlideDoc = {
  title: "היום: מסיימים את החזרה למבחן 🎯",
  blocks: {
    task: {
      heading: "המשימה",
      lines: [
        "לסיים את משימת החזרה למבחן ולהגיש אותה באתר.",
        "כל תשובה נכתבת מתוך הפסוקים, עם מספר פסוק.",
      ],
    },
    rules: {
      heading: "הכללים",
      lines: [
        "תנ״ך פתוח על השולחן, הטלפון בתיק.",
        "עובדים בשקט ובריכוז, כל אחד על המשימה שלו.",
        "שאלה? מרימים יד, או שואלים את קלוד שבתוך המשימה.",
        "בלי לגלוש לאתרים אחרים.",
      ],
    },
    done: {
      heading: "סיימת?",
      lines: [
        "מגישים באתר, ואני בודקת שהכול הושלם.",
        "מי שסיים ברצינות ובמלואו יוצא הביתה מוקדם 🏠",
      ],
    },
  },
  footer: "ככל שמתרכזים יותר, יוצאים מוקדם יותר.",
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Accepts anything (a request body, a stored row, a chat tool input merged
// over the current doc) and returns a well-formed doc: what is missing comes
// from `fallback`, empty lines are dropped, at most 10 lines per block.
export function cleanSlide(raw: unknown, fallback: SlideDoc = DEFAULT_SLIDE): SlideDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rb = (r.blocks && typeof r.blocks === "object" ? r.blocks : {}) as Record<string, unknown>;
  const blocks = {} as Record<SlideBlockKey, SlideBlock>;
  for (const k of SLIDE_BLOCK_KEYS) {
    const b = (rb[k] && typeof rb[k] === "object" ? rb[k] : {}) as Record<string, unknown>;
    blocks[k] = {
      heading: typeof b.heading === "string" ? clip(b.heading, 80) : fallback.blocks[k].heading,
      lines: Array.isArray(b.lines)
        ? b.lines.map((l) => clip(l, 300)).filter(Boolean).slice(0, 10)
        : fallback.blocks[k].lines,
    };
  }
  return {
    title: typeof r.title === "string" ? clip(r.title, 200) : fallback.title,
    blocks,
    footer: typeof r.footer === "string" ? clip(r.footer, 300) : fallback.footer,
  };
}
