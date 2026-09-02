import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";

// הפרויקט — the annual PBL project, as specified in the teacher's project
// document ("מפסוקי התנ״ך לקמפיין ציבורי"). The work space (teams, drafts,
// feedback, submission) opens later; the plan and stages live here already.
const STAGES = [
  {
    n: 1,
    weeks: "שבועות 1–4",
    title: "חקירת המקורות והגדרת ״הבעיה״",
    lessons:
      "לומדים את יחידות המקורות (ויקרא ושמואל ב׳) בדגש על ערכי חברה, מנהיגות, כבוד ויושרה.",
    mission:
      "כל צוות תלמידים בוחר ערך או בעיה חברתית אחת מתוך הלימוד — למשל: שמיטת חובות ופערים כלכליים, שיימינג ו״לא תקלל חרש״, ניצול כוח ומנהיגות קלוקלת.",
    product: "״דף עמדה״ קצר המסביר מהי הבעיה במציאות של היום, ואילו פסוקים או סיפורים מביעים אותה.",
    emoji: "🔍",
  },
  {
    n: 2,
    weeks: "שבועות 5–7",
    title: "ניתוח קהל יעד ותכנון המסר",
    lessons:
      "ניתוח סיפורי מקרה (דוד ובת שבע, מרד אבשלום) כמקרי בוחן של תקשורת והשפעה על הציבור.",
    mission:
      "מגדירים: מי קהל היעד (תלמידי בית הספר / בני נוער ברשת / הקהילה המקומית)? מהו הסלוגן — שילוב של סלוגן מודרני עם ציטוט או פסוק מוביל (למשל: ״קדושים תהיו — לא עומדים מהצד״)?",
    product: "בריף לקמפיין — הגדרת המסר, קהל היעד והקונספט הוויזואלי.",
    emoji: "🎯",
  },
  {
    n: 3,
    weeks: "שבועות 8–10",
    title: "הפקת חומרי הקמפיין",
    lessons: "עבודה מעשית (בזמן המחשבים בשיעור) על פיתוח התוצרים.",
    mission:
      "כל צוות מייצר ערכת קמפיין דיגיטלית או פיזית: כרזת סלוגן מרכזית (עיצוב ב-Canva), סרטון קצר (Reels / TikTok / 60 שניות) שמשלב את הדילמה התנ״כית עם המציאות כיום, וסטיקר או פוסט לרשתות החברתיות המציג את הפתרון שהתנ״ך מציע.",
    product: "טיוטה ראשונה של חומרי הקמפיין למורה, לקבלת משוב ושיפור.",
    emoji: "🎨",
  },
  {
    n: 4,
    weeks: "שבוע 11",
    title: "אירוע השיא — השקת הקמפיין",
    lessons: "יום שיא בית-ספרי או תערוכה בלובי.",
    mission:
      "הצוותים מציגים את הקמפיין שלהם בפני השכבה או כלל בית הספר, ומחתימים תלמידים על ״אמנת הקדושה החברתית״ שנוצרה בעקבות הקמפיינים.",
    product: "הקמפיין עצמו — מוצג, נראה, ומשפיע.",
    emoji: "🚀",
  },
];

export default async function ProjectPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <PageShell
      title="הפרויקט"
      subtitle="מדריך / אפליקציה לחברה מתוקנת · מפסוקי התנ״ך לקמפיין ציבורי · עבודה בצוותים"
    >
      <div className="mx-auto max-w-4xl space-y-10">
        <section className="rounded-2xl border-2 border-[color:var(--accent)]/40 bg-[color:var(--card)] p-6">
          <p className="mb-1 text-[10px] font-bold tracking-[0.25em] text-[color:var(--accent)]">
            הרעיון
          </p>
          <h2 className="font-display text-xl font-bold text-[color:var(--primary)]">
            מה חברה מתוקנת דורשת מאיתנו — ואיך אומרים את זה לאחרים?
          </h2>
          <p className="mt-2 text-sm leading-7 text-[color:var(--foreground)]/80">
            לאורך השנה אנחנו לומדים בספר ויקרא ובספר שמואל ב׳ איך נראית חברה
            מתוקנת: כבוד, יושרה, מנהיגות, אחריות למי שבשוליים. הפרויקט לוקח את
            מה שלמדנו והופך אותו ל<b>קמפיין ציבורי</b>: כל צוות בוחר ערך או בעיה
            חברתית אחת מתוך המקורות, מגדיר קהל יעד ומסר, מפיק חומרי קמפיין —
            ומציג אותם ביום השיא בפני בית הספר.
          </p>
        </section>

        <section>
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-[color:var(--primary)]">
            <span>🗺️</span> שלבי הפרויקט
          </h2>
          <ol className="space-y-4">
            {STAGES.map((s) => (
              <li
                key={s.n}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--primary)] font-display text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <h3 className="font-display text-lg font-bold text-[color:var(--primary)]">
                    {s.emoji} {s.title}
                  </h3>
                  <span className="rounded-full bg-[color:var(--accent)]/15 px-3 py-1 text-[11px] font-bold text-[color:var(--accent)]">
                    {s.weeks}
                  </span>
                </div>
                <div className="grid gap-3 text-xs leading-6 sm:grid-cols-3">
                  <div className="rounded-xl bg-[color:var(--background)] p-3">
                    <p className="mb-0.5 font-bold text-[color:var(--primary)]">📖 מה עושים בשיעורים</p>
                    <p className="text-[color:var(--foreground)]/75">{s.lessons}</p>
                  </div>
                  <div className="rounded-xl bg-[color:var(--background)] p-3">
                    <p className="mb-0.5 font-bold text-[color:var(--primary)]">🧩 המשימה לקמפיין</p>
                    <p className="text-[color:var(--foreground)]/75">{s.mission}</p>
                  </div>
                  <div className="rounded-xl bg-[color:var(--background)] p-3">
                    <p className="mb-0.5 font-bold text-[color:var(--primary)]">📦 תוצר ביניים</p>
                    <p className="text-[color:var(--foreground)]/75">{s.product}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="rounded-2xl border border-dashed border-[color:var(--accent)]/40 bg-[color:var(--card)]/70 p-6 text-center">
          <p className="font-display text-base font-bold text-[color:var(--primary)]">
            🛠️ מרחב העבודה של הצוותים ייפתח כאן
          </p>
          <p className="mt-1 text-xs leading-6 text-[color:var(--foreground)]/60">
            חלוקה לצוותים, בחירת הערך, דף העמדה, הבריף, טיוטות חומרי הקמפיין,
            משוב קלוד ומשוב המורה — הכול יופיע כאן כשנצא לדרך.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
