import PageShell from "@/components/page-shell";

// "כללי השיעור שלנו" — the six class rules exactly as set by the teacher
// (content/source: the project document), and the lesson flow as redesigned
// with her on 27.9.2026: review → debate → study, in the order she chooses.
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

const FLOW = [
  {
    emoji: "🔁",
    title: "חזרה — 5 דקות",
    body: "המורה מקרינה מצגת קצרה על היחידה הקודמת. זו תזכורת למי שלמד — לא דרך להיכנס לדיון בלי ללמוד.",
  },
  {
    emoji: "💬",
    title: "דיון — 15 דקות",
    body: "דיבייט על שאלת היחידה הקודמת. על הלוח: השאלה, הדוברים, שעון לכל דובר/ת, וקיר שעליו המורה רושמת משפטי מפתח. כרטיס הכניסה לדיון: ענו על כל השאלות של היחידה, כולל בניית הטיעון — המורה רואה את זה באתר ומאשרת.",
  },
  {
    emoji: "📖",
    title: "לימוד — 20 דקות",
    body: "קריאה בתנ״ך הפיזי עם המורה, ואז זמן מחשבים מוגדר: היחידה הבאה באתר, עם ההקראה ועם עזרת קלוד — ״עושים לבד, אבל לא פוגשים קיר״. בסוף היחידה: טענה, נימוק וביסוס לדיון הבא.",
  },
];

export default function RulesPage() {
  return (
    <PageShell
      title="כללי השיעור שלנו"
      subtitle="שישה כללים ומהלך שיעור ברור — כדי שכולנו נוכל ללמוד ולהתווכח"
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
            <span>🧭</span> מהלך השיעור — שלושה חלקים
          </h2>
          <ol className="relative space-y-3">
            {FLOW.map((s, i) => (
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
            💡 הסדר של שלושת החלקים משתנה לפי השיעור — המורה מודיעה בתחילתו. שיעור כפול
            יכול לכלול שני דיונים, והשיעור שאחריו נפתח בלימוד. שני דברים לא משתנים:
            הדיון הוא תמיד על יחידה שכבר למדנו, ומי שסיים/ה אותה — מדבר/ת. וכמובן:
            כשמישהו מדבר, אף אחד אחר לא.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
