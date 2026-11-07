import Link from "next/link";
import { charterSummary } from "@/lib/amana";
import { StatusTag } from "./clause-card";

// The charter's standing card: on top of /tasks (wide — the newest clause,
// the count and "לאמנה המלאה") and on /me (small). Server component; renders
// nothing if the DB is not reachable.
export default async function CharterCard({ size = "wide" }: { size?: "wide" | "small" }) {
  let summary: Awaited<ReturnType<typeof charterSummary>>;
  try {
    summary = await charterSummary();
  } catch {
    return null;
  }
  const { count, latest } = summary;
  const countLabel = count === 0 ? "האמנה עוד ריקה" : `${count} ${count === 1 ? "סעיף" : "סעיפים"} באמנה`;

  if (size === "small") {
    return (
      <Link
        href="/amana"
        className="mb-6 flex items-center gap-3 rounded-2xl border border-[#d9c3a5] p-4 shadow-sm transition hover:border-[color:var(--accent)] hover:shadow-md"
        style={{ background: "linear-gradient(135deg, #fdf3e1, #fffaf0)" }}
      >
        <span className="text-3xl" aria-hidden>📜</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-[color:var(--primary)]">אמנת הכיתה · {countLabel}</p>
          {latest && <p className="truncate text-xs text-[color:var(--foreground)]/65">האחרון: {latest.text}</p>}
        </div>
        <span className="shrink-0 text-xs font-bold text-[color:var(--accent)]">לאמנה ←</span>
      </Link>
    );
  }

  return (
    <section
      className="mb-6 rounded-2xl border-2 border-[#d9c3a5] p-5 shadow-sm sm:p-6"
      style={{ background: "linear-gradient(135deg, #fdf3e1 0%, #fffaf0 60%, #fbefd9 100%)" }}
      aria-label="אמנת הכיתה"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold tracking-wide text-[color:var(--accent)]">📜 אמנת הכיתה · {countLabel}</p>
          {latest ? (
            <>
              <p className="mt-0.5 text-[11px] font-bold text-[color:var(--foreground)]/50">הסעיף האחרון שנוסף (סעיף {latest.position}):</p>
              <p className="mt-1 font-display text-lg font-bold leading-relaxed text-[color:var(--primary)]">״{latest.text}״</p>
              {latest.verseSource && (
                <p className="mt-0.5 text-xs text-[color:var(--foreground)]/60">
                  {latest.verseQuote && <span className="font-mikra text-sm">״{latest.verseQuote}״ </span>}({latest.verseSource})
                </p>
              )}
              <StatusTag status={latest.status} className="mt-2" />
            </>
          ) : (
            <p className="mt-1 text-sm text-[color:var(--foreground)]/65">בכל יחידה נוסיף סעיף מתוך הפסוקים — האמנה נבנית לאורך השנה.</p>
          )}
        </div>
        <Link
          href="/amana"
          className="shrink-0 self-center rounded-full bg-[color:var(--primary)] px-5 py-2 text-sm font-bold text-white shadow transition hover:bg-[color:var(--accent)]"
        >
          לאמנה המלאה ←
        </Link>
      </div>
    </section>
  );
}
