import Link from "next/link";

// מהלך השיעור — the three building blocks of a lesson, as three doors on
// the teacher's task page. The ORDER IS HERS: a double lesson may run two
// debates; the next lesson may open with study. Nothing here is locked or
// sequenced by the site — it only makes each block one click away and says
// plainly what each one is.
export default function LessonFlow({
  taskId,
  prevTaskId,
  prevTitle,
}: {
  taskId: number;
  // the previous unit — its question is what the class debates now
  prevTaskId: number | null;
  prevTitle: string | null;
}) {
  return (
    <section className="mx-auto mb-8 max-w-3xl">
      <div className="mb-3 text-center">
        <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">
          🧭 מהלך השיעור — שלושה כלים, בסדר שתבחרי
        </p>
        <p className="text-xs text-[color:var(--primary)]/60">
          חזרה קצרה · דיון על היחידה הקודמת · לימוד היחידה הזו. שעתיים? אפשר שני דיונים. השיעור הבא יכול להיפתח בלימוד.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Door
          emoji="🔁"
          title="חזרה"
          minutes="5 דק׳"
          what={prevTitle ? `מצגת תמציתית על ״${prevTitle}״` : "מצגת תמציתית על היחידה הקודמת"}
          primary={prevTaskId ? { href: `/dashboard/review/${prevTaskId}`, label: "🖥️ להקרין" } : null}
          note={prevTaskId ? null : "אין יחידה קודמת"}
        />
        <Door
          emoji="💬"
          title="דיון"
          minutes="15 דק׳"
          what={prevTitle ? `על השאלה של ״${prevTitle}״ — רק מי שסיימו אותה` : "על שאלת היחידה הקודמת"}
          primary={prevTaskId ? { href: `/dashboard/discussion/${prevTaskId}/control`, label: "🎛️ בקרה (כאן / בטלפון)" } : null}
          secondary={prevTaskId ? { href: `/dashboard/discussion/${prevTaskId}/board`, label: "🖥️ הלוח (לפרוייקטור)", newTab: true } : null}
          note={prevTaskId ? "הלוח על הפרוייקטור, הבקרה אצלך — שני חלונות נפרדים" : "אין יחידה קודמת"}
          accent
        />
        <Door
          emoji="📖"
          title="לימוד"
          minutes="20 דק׳"
          what="היחידה הזו באתר — כל אחד/ת בקצב שלו/ה"
          primary={{ href: `/tasks/${taskId}`, label: "👀 כפי שהכיתה רואה" }}
          secondary={{ href: `/dashboard/class-board/${taskId}`, label: "🖥️ לוח הכיתה", newTab: true }}
        />
      </div>
    </section>
  );
}

function Door({
  emoji,
  title,
  minutes,
  what,
  primary,
  secondary,
  note,
  accent,
}: {
  emoji: string;
  title: string;
  minutes: string;
  what: string;
  primary: { href: string; label: string; newTab?: boolean } | null;
  secondary?: { href: string; label: string; newTab?: boolean } | null;
  note?: string | null;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border-2 bg-[color:var(--card)] p-4 ${
        accent ? "border-[color:var(--accent)]/60" : "border-[color:var(--border)]"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">
          {emoji} {title}
        </p>
        <span className="rounded-full bg-[color:var(--background)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--primary)]/60">
          ~{minutes}
        </span>
      </div>
      <p className="mb-3 text-xs leading-5 text-[color:var(--foreground)]/70">{what}</p>
      <div className="mt-auto flex flex-col gap-1.5">
        {primary && (
          <Link
            href={primary.href}
            target={primary.newTab ? "_blank" : undefined}
            className={`rounded-full px-3 py-2 text-center text-xs font-bold text-white shadow transition hover:scale-[1.02] ${
              accent ? "bg-[color:var(--accent)]" : "bg-[color:var(--primary)]"
            }`}
          >
            {primary.label}
          </Link>
        )}
        {secondary && (
          <Link
            href={secondary.href}
            target={secondary.newTab ? "_blank" : undefined}
            className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-center text-xs font-bold text-[color:var(--primary)] transition hover:border-[color:var(--accent)]"
          >
            {secondary.label}
          </Link>
        )}
        {note && <p className="text-[10px] text-[color:var(--primary)]/50">{note}</p>}
      </div>
    </div>
  );
}
