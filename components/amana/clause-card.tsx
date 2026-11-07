import { CLAUSE_STATUS_META, formatClauseDate, type PublicClause } from "@/lib/amana-shared";

// One clause on the charter scroll: its number, the wording, the verse that
// grounds it, a unit tag and a coloured status tag. Pure — used by /amana
// (students) and the teacher's preview alike.
export function StatusTag({ status, className = "" }: { status: PublicClause["status"]; className?: string }) {
  const m = CLAUSE_STATUS_META[status];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${className}`} style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

export default function ClauseCard({
  clause,
  unitLabel,
  isNew = false,
}: {
  clause: PublicClause;
  unitLabel: string | null;
  isNew?: boolean;
}) {
  return (
    <li className={`relative flex gap-4 border-b border-dashed border-[#d9c3a5] py-5 last:border-b-0 ${isNew ? "amana-in" : ""}`}>
      <span
        aria-hidden
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--accent)] bg-[#fffaf0] font-display text-lg font-extrabold text-[color:var(--accent)]"
      >
        {clause.position}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {isNew && (
            <span className="amana-glow rounded-full bg-[color:var(--accent)] px-2.5 py-0.5 text-[11px] font-extrabold text-white">חדש!</span>
          )}
          <StatusTag status={clause.status} />
          {unitLabel && (
            <span className="rounded-full border border-[color:var(--primary)]/25 px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--primary)]/75">
              📖 {unitLabel}
            </span>
          )}
        </div>
        <p className="font-display text-lg font-bold leading-relaxed text-[color:var(--primary)] sm:text-xl">
          <span className="sr-only">סעיף {clause.position}: </span>
          {clause.text}
        </p>
        {(clause.verseQuote || clause.verseSource) && (
          <p className="mt-1.5 text-[15px] leading-7 text-[color:var(--foreground)]/80">
            {clause.verseQuote && <span className="font-mikra text-lg">״{clause.verseQuote}״</span>}
            {clause.verseSource && <span className="mr-1.5 text-xs font-bold text-[color:var(--accent)]">({clause.verseSource})</span>}
          </p>
        )}
        {clause.teacherNote && (
          <p className="mt-2 rounded-lg bg-[color:var(--background)] px-3 py-1.5 text-xs leading-5 text-[color:var(--foreground)]/75">
            ✍️ {clause.teacherNote}
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-[color:var(--foreground)]/45">
          {clause.clauseDate && formatClauseDate(clause.clauseDate)}
          {clause.proposedBy && <> · הוצע על ידי {clause.proposedBy}</>}
        </p>
      </div>
    </li>
  );
}
