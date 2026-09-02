import PageShell from "@/components/page-shell";

// "כללי השיעור שלנו" — the six class rules and the fixed lesson routine,
// exactly as set by the teacher (content/source: the project document).
const RULES = [
  {
    emoji: "⏰",
    title: "זמנים",
    body: "אין איחורים מעל 5 דקות. מי שמאחר מעבר לזה — נשאר בחוץ ולא נכנס.",
  },
  {
    emoji: "🗣️",
    title: "כבוד בשיח",
    body: "כשיש מישהו שמדבר (מורה או תלמיד) — אף אחד אחר לא מדבר.",
  },
  {
    emoji: "🪑",
    title: "יציבות בכיתה",
    body: "אסור לטייל בכיתה ללא רשות.",
  },
  {
    emoji: "💻",
    title: "מחשבים",
    body: "המחשב סגור לחלוטין, ופותחים אותו רק כשהמורה מגדירה זמן עבודה באתר.",
  },
  {
    emoji: "🚪",
    title: "יציאות",
    body: "אין יציאה מהכיתה ללא אישור.",
  },
  {
    emoji: "📵",
    title: "טלפונים",
    body: "אין פלאפונים בשיעור — בתוך התיקים, מושתקים.",
  },
];

const ROUTINE = [
  {
    emoji: "📖",
    title: "קריאה משותפת",
    body: "המורה קוראת בתנ״ך הפיזי, ואז קוראים יחד. המחשבים עדיין סגורים.",
  },
  {
    emoji: "🧭",
    title: "מיומנות השיעור",
    body: "איך מפענחים מילים, טעמים, פרקים ופסוקים — התרגול הפיזי עם התנ״ך.",
  },
  {
    emoji: "💻",
    title: "עבודה עצמית באתר",
    body: "זמן מחשבים מוגדר: המשימה השוטפת, עם ההקראה ועם עזרת קלוד — ״עושים לבד, אבל לא פוגשים קיר״.",
  },
  {
    emoji: "💬",
    title: "סיכום ודיון",
    body: "סוגרים את המחשבים, מסכמים יחד, ורגע של רפלקציה.",
  },
];

export default function RulesPage() {
  return (
    <PageShell
      title="כללי השיעור שלנו"
      subtitle="שישה כללים ושגרה קבועה — כדי שכולנו נוכל ללמוד"
    >
      <div className="mx-auto max-w-4xl space-y-10">
        <section>
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-[color:var(--primary)]">
            <span>📜</span> ״כללי המשחק״
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2">
            {RULES.map((r, i) => (
              <li
                key={r.title}
                className="flex gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)]/8 text-xl">
                  {r.emoji}
                </span>
                <div>
                  <p className="font-display text-base font-bold text-[color:var(--primary)]">
                    {i + 1}. {r.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--foreground)]/75">
                    {r.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-[color:var(--primary)]">
            <span>🔁</span> שגרת השיעור הקבועה
          </h2>
          <ol className="relative space-y-3">
            {ROUTINE.map((s, i) => (
              <li
                key={s.title}
                className="flex gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] font-display text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-display text-base font-bold text-[color:var(--primary)]">
                    {s.emoji} {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--foreground)]/75">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl bg-[color:var(--accent)]/10 px-4 py-3 text-xs leading-6 text-[color:var(--foreground)]/75">
            💡 למה השגרה קבועה? כי כשיודעים מה בא עכשיו — הראש פנוי ללימוד עצמו.
            הקריאה תמיד קודמת למחשב, והמחשב תמיד נסגר לפני הסיכום.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
