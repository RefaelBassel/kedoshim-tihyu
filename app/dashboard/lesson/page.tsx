import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import LessonPlanner from "@/components/dashboard/lesson-planner";

// מהלך השיעור — the teacher's one place for the lesson itself, NOT under
// any task: the three kinds of blocks explained once, and today's plan
// composed from them in whatever order she chooses. Once started, the strip
// at the top of every page carries the plan with her.
const BLOCKS = [
  {
    emoji: "🔁",
    title: "חזרה",
    minutes: "~5 דק׳",
    what: "מצגת תמציתית על יחידה שכבר נלמדה: כותרת, 3-4 נקודות, המיומנות, ושאלת הדיון בסוף.",
    who: "כל הכיתה מקשיבה. מחשבים סגורים.",
    tool: "🖥️ מצגת על הפרוייקטור (ניתנת לעריכה ידנית ובעזרת קלוד)",
  },
  {
    emoji: "💬",
    title: "דיון",
    minutes: "~15 דק׳",
    what: "דיבייט על שאלת היחידה: על הלוח השאלה, הדוברים, שעון לכל דובר/ת, וקיר משפטי מפתח.",
    who: "מדברים רק מי שענו על כל שאלות היחידה (🎫). את מאשרת בלחיצה — ויכולה לחרוג.",
    tool: "🎛️ בקרה בטלפון/במחשב שלך · 🖥️ לוח נפרד על הפרוייקטור",
  },
  {
    emoji: "📖",
    title: "לימוד",
    minutes: "~20 דק׳",
    what: "קריאה בתנ״ך הפיזי, ואז זמן מחשבים: היחידה הבאה באתר, עם ההקראה ועזרת קלוד.",
    who: "כל אחד/ת בקצב שלו/ה. בסוף היחידה — טענה, נימוק וביסוס לדיון הבא.",
    tool: "👀 המשימה כפי שהכיתה רואה · 🖥️ לוח הכיתה · 📊 דופק כיתה",
  },
];

export default async function LessonPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");

  return (
    <PageShell
      title="מהלך השיעור"
      subtitle="שלושה חלקים, בסדר שאת בוחרת — שיעור כפול יכול לכלול שני דיונים, והשיעור הבא יכול להיפתח בלימוד"
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <LessonPlanner />

        <section>
          <h2 className="mb-3 text-center font-display text-lg font-extrabold text-[color:var(--primary)]">
            שלושת החלקים — מה קורה בכל אחד
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {BLOCKS.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4"
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">
                    {b.emoji} {b.title}
                  </p>
                  <span className="rounded-full bg-[color:var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[color:var(--accent)]">
                    {b.minutes}
                  </span>
                </div>
                <p className="text-xs leading-6 text-[color:var(--foreground)]/80">{b.what}</p>
                <p className="mt-2 text-xs leading-6 text-[color:var(--primary)]/70">👥 {b.who}</p>
                <p className="mt-2 text-[11px] leading-5 text-[color:var(--primary)]/55">{b.tool}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl bg-[color:var(--accent)]/10 px-4 py-3 text-xs leading-6 text-[color:var(--foreground)]/75">
            💡 הדיון והחזרה הם תמיד על יחידה <b>שכבר נלמדה</b>; הלימוד — על היחידה הבאה. לכן
            שיעור רגיל נראה בדרך כלל: חזרה על 1 → דיון על 1 → לימוד 2. אבל זה שלך לקבוע.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
