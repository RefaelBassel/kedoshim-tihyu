import Link from "next/link";
import PageShell from "@/components/page-shell";

// The annual program — the topics/chapters table from the teacher's planning
// document (ויקרא + שמואל ב׳), the six skills of the program, and the fixed
// lesson routine. Order of study: ויקרא ט״ז first (adjacent to יום הכיפורים
// in the calendar), then the units in order. Which skill enters which topic
// is decided by the teacher as the year unfolds — nothing here is invented.
const SKILLS = [
  {
    emoji: "📖",
    title: "קריאה",
    body: "המורה פותחת כל שיעור בקריאה בתנ״ך פיזי כשהמחשבים סגורים. באתר — כל פסוק ניתן להשמעה בקריינות (אברהם שמואלוף), ובמשימות יש שאלות האזנה וקריאה בקול.",
    where: "בכיתה + באתר",
  },
  {
    emoji: "🎵",
    title: "טעמי המקרא",
    body: "לא קריאה בטעמים — זיהוי הטעמים המעמידים, ובעיקר האתנחתא: איפה ״פסיק״ ואיפה ״נקודה״ בפסוק. מתורגל פיזית עם המורה, והמשימות שואלות: באיזו מילה האתנחתא, ואיך היא מחלקת את הפסוק.",
    where: "בכיתה + באתר",
  },
  {
    emoji: "🧭",
    title: "התמצאות בתנ״ך",
    body: "דפדוף ומציאת ספר, פרק ופסוק — בתנ״ך הפיזי. המשימות השוטפות שולחות לפתוח את הספר: מה לפני, מה אחרי, באיזה פסוק כתוב, איפה זה מופיע שוב.",
    where: "בכיתה + באתר",
  },
  {
    emoji: "📌",
    title: "מילה מנחה",
    body: "מילה או שורש שחוזרים בקטע חזרה משמעותית — המפתח שהתורה מניחה לנו. סימון אינטראקטיבי בקטע עם משוב מיידי מקלוד.",
    where: "באתר · ייכנס בהמשך",
  },
  {
    emoji: "❓",
    title: "שאלת שאלות",
    body: "להפוך אי-הבנה לשאלה מנוסחת. כל שאלה נאספת למאגר השאלות האישי.",
    where: "באתר · ממחצית ב׳",
  },
  {
    emoji: "🤔",
    title: "מילה קשה וזיהוי מההקשר",
    body: "לסמן מה לא מובן, ולנסות להבין מהפסוק ומהמילים שסביבו — לפני שמבקשים פירוש.",
    where: "באתר · ייכנס בהמשך",
  },
];

// ויקרא — from the planning table (lesson counts intentionally omitted).
const VAYIKRA = [
  { n: "★", topic: "עבודת כהן גדול ביום הכיפורים", chapters: "ט״ז", when: "אלול – תשרי", first: true },
  { n: "1", topic: "פתיחה לחומש ויקרא וקורבנות נדבה", chapters: "פסוקים נבחרים מפרקים א׳–ה׳, ז׳ (על פי תכנית הלימודים)", when: "אלול ותשרי" },
  { n: "2", topic: "שבעת ימי המילואים והיום השמיני", chapters: "ח׳–י׳", when: "חשוון – כסלו" },
  { n: "3", topic: "סוגיות בפרקי טומאה וטהרה", chapters: "י״א, י״ב, י״ג–י״ד", when: "" },
  { n: "5", topic: "קדושת האדם בחיים", chapters: "י״ח", when: "טבת – שבט" },
  { n: "", topic: "קדושים תהיו", chapters: "י״ט", when: "" },
  { n: "6", topic: "קדושת הזמן והמקום", chapters: "כ״ג, כ״ה", when: "אדר – אייר" },
  { n: "7", topic: "הברית", chapters: "כ״ו", when: "סיוון" },
];

// שמואל ב — from the planning table.
const SHMUEL = [
  { n: "1", topic: "סופו של בית שאול", chapters: "א׳ (א׳–ד׳; י״ז–כ״ז), ב׳", when: "אלול – תשרי" },
  { n: "2", topic: "מלכות דוד בראשיתה", chapters: "ה׳–ז׳", when: "חשוון – חנוכה" },
  { n: "3", topic: "מעשה דוד ובת שבע ותוצאותיו", chapters: "י״א–י״ד", when: "טבת – שבט" },
  { n: "4", topic: "מרד אבשלום", chapters: "ט״ו–י״ט", when: "אדר – אייר" },
  { n: "5", topic: "סוף ימיו של דוד וסיכום", chapters: "כ״ד", when: "סיוון" },
];

const ROUTINE = ["קריאה משותפת", "מיומנות השיעור", "עבודה עצמית באתר", "סיכום ודיון"];

export default function ProgramPage() {
  return (
    <PageShell
      title="התוכנית ולו״ז"
      subtitle="איך נראית חברה מתוקנת על פי ספרים ויקרא ושמואל ב׳ · כיתות ט · תיכון שחרית"
    >
      <div className="mx-auto max-w-4xl space-y-10">
        {/* ===== the question of the year ===== */}
        <section className="rounded-2xl border-2 border-[color:var(--accent)]/50 bg-[color:var(--card)] p-6">
          <p className="mb-1 text-[10px] font-bold tracking-[0.25em] text-[color:var(--accent)]">
            השאלה של השנה
          </p>
          <h2 className="font-display text-2xl font-bold text-[color:var(--primary)]">
            איך נראית חברה מתוקנת?
          </h2>
          <p className="mt-2 text-sm leading-7 text-[color:var(--foreground)]/75">
            שני ספרים, שתי זוויות: <b>ספר ויקרא</b> — הקדושה כדרך חיים של עם שלם,
            מהמשכן ועד ״קדושים תהיו״; ו<b>ספר שמואל ב׳</b> — מלכות דוד, על גדולתה
            ועל שבריה: מנהיגות, כוח, חטא ותיקון. לאורך השנה בונים מזה גם{" "}
            <Link href="/project" className="font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline">
              פרויקט — קמפיין ציבורי
            </Link>
            .
          </p>
        </section>

        {/* ===== skills ===== */}
        <section>
          <SectionTitle emoji="🎯" title="שש המיומנויות של התוכנית" />
          <div className="grid gap-4 sm:grid-cols-2">
            {SKILLS.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-[color:var(--primary)]">
                    {s.emoji} {s.title}
                  </h3>
                  <span className="rounded-full bg-[color:var(--accent)]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]">
                    {s.where}
                  </span>
                </div>
                <p className="text-xs leading-6 text-[color:var(--foreground)]/75">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-6 text-[color:var(--foreground)]/55">
            איזו מיומנות נכנסת באיזה נושא — נקבע לאורך השנה. המשימות הראשונות
            (ויקרא ט״ז) מתרגלות הבנה, התמצאות, טעמים והאזנה בלבד.
          </p>
        </section>

        {/* ===== routine ===== */}
        <section>
          <SectionTitle emoji="🔁" title="שגרת השיעור" />
          <div className="flex flex-wrap items-center gap-2">
            {ROUTINE.map((r, i) => (
              <span key={r} className="flex items-center gap-2">
                <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-1.5 text-sm font-semibold text-[color:var(--primary)]">
                  {i + 1}. {r}
                </span>
                {i < ROUTINE.length - 1 && (
                  <span aria-hidden className="text-[color:var(--accent)]">←</span>
                )}
              </span>
            ))}
            <Link
              href="/rules"
              className="ms-2 text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
            >
              לכללי השיעור המלאים ←
            </Link>
          </div>
        </section>

        {/* ===== Vayikra ===== */}
        <section>
          <SectionTitle emoji="📚" title="ספר ויקרא — הנושאים והפרקים" />
          <Table rows={VAYIKRA} />
          <p className="mt-2 text-xs leading-6 text-[color:var(--foreground)]/55">
            ★ פרק ט״ז נלמד ראשון — בגלל סמיכות הזמנים ליום הכיפורים בלוח השנה.
            אחריו ממשיכים לפי סדר הנושאים.
          </p>
        </section>

        {/* ===== Shmuel II ===== */}
        <section>
          <SectionTitle emoji="👑" title="ספר שמואל ב׳ — הנושאים והפרקים" />
          <Table rows={SHMUEL} />
        </section>
      </div>
    </PageShell>
  );
}

function Table({
  rows,
}: {
  rows: { n: string; topic: string; chapters: string; when: string; first?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[color:var(--border)] text-right text-[11px] text-[color:var(--primary)]/60">
            <th className="px-4 py-2.5 font-semibold">#</th>
            <th className="px-4 py-2.5 font-semibold">הנושא</th>
            <th className="px-4 py-2.5 font-semibold">הפרקים הנלמדים</th>
            <th className="px-4 py-2.5 font-semibold">המלצה לתכנון שנתי</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={[
                "border-b border-[color:var(--border)]/50 last:border-0",
                r.first ? "bg-[color:var(--accent)]/8" : "",
              ].join(" ")}
            >
              <td className="px-4 py-2.5 font-bold text-[color:var(--accent)]">{r.n}</td>
              <td className="px-4 py-2.5 font-semibold text-[color:var(--primary)]">{r.topic}</td>
              <td className="px-4 py-2.5 text-[color:var(--foreground)]/80">{r.chapters}</td>
              <td className="px-4 py-2.5 text-[color:var(--foreground)]/65">{r.when || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-[color:var(--primary)]">
      <span>{emoji}</span> {title}
    </h2>
  );
}
