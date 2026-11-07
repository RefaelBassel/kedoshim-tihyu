import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import ClauseCard from "@/components/amana/clause-card";
import { MarkSeen, ProposalsBoard } from "@/components/amana/amana-client";
import { isStudentMode } from "@/lib/student-mode";
import {
  lastSeenClauseId,
  listClauses,
  publicClause,
  remainingUnits,
  unitLabel,
  visibleProposals,
  type Clause,
  type PublicUnitProposals,
} from "@/lib/amana";

// אמנת הכיתה — the class charter, built unit by unit "before the students'
// eyes": a festive scroll of clauses, each with its grounding verse, unit tag
// and status; new clauses unroll with a "חדש!" badge the first time; empty
// dashed slots for the units still ahead; the proposals the teacher chose to
// show, with 👍. Students only read, propose (in the worksheets) and vote.
export default async function AmanaPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  const userId = Number(user.id);
  const studentMode = user.role === "teacher" && (await isStudentMode());
  const isTeacher = user.role === "teacher" && !studentMode;

  let clauses: Clause[] = [];
  let seen = 0;
  let proposals: PublicUnitProposals[] = [];
  try {
    clauses = await listClauses();
    seen = isTeacher ? Number.MAX_SAFE_INTEGER : await lastSeenClauseId(userId);
    proposals = await visibleProposals(userId);
  } catch {
    // DB not ready — the page still renders
  }
  const remaining = remainingUnits(clauses);

  return (
    <PageShell title="אמנת הכיתה" subtitle="מה למדנו מספר ויקרא על חברה מתוקנת — ואיך זה נראה אצלנו בבית הספר">
      {!isTeacher && <MarkSeen />}
      {isTeacher && (
        <div className="mb-4 flex justify-center">
          <Link href="/dashboard/amana" className="rounded-full border border-[color:var(--primary)]/30 px-4 py-1.5 text-xs font-bold text-[color:var(--primary)] hover:border-[color:var(--accent)]">
            ✏️ ניהול האמנה (מורה)
          </Link>
        </div>
      )}

      {/* the scroll */}
      <div className="mx-auto max-w-3xl">
        <div aria-hidden className="mx-2 h-5 rounded-full bg-gradient-to-b from-[#a7774f] via-[#d8b48a] to-[#8a5c37] shadow-md" />
        <article
          className="relative mx-5 border-x-4 border-double border-[#c79a6b] px-5 pb-8 pt-7 shadow-inner sm:px-10"
          style={{ background: "linear-gradient(180deg, #fdf3e1 0%, #fffaf0 18%, #fffaf0 82%, #fbefd9 100%)" }}
        >
          <header className="text-center">
            <p className="text-2xl" aria-hidden>📜</p>
            <h2 className="font-display text-3xl font-extrabold text-[color:var(--primary)] sm:text-4xl">אמנת הכיתה — קדושים תהיו</h2>
            <p className="mt-1 text-sm font-bold text-[color:var(--accent)]">
              {clauses.length === 0 ? "האמנה עוד ריקה — הסעיף הראשון בדרך" : `${clauses.length} ${clauses.length === 1 ? "סעיף" : "סעיפים"} באמנה`}
            </p>
            <div aria-hidden className="mx-auto mt-3 h-px w-40 bg-gradient-to-l from-transparent via-[color:var(--accent)] to-transparent" />
          </header>

          <ol className="mt-4">
            {clauses.map((c) => (
              <ClauseCard key={c.id} clause={publicClause(c)} unitLabel={unitLabel(c.unitRef)} isNew={c.id > seen} />
            ))}
          </ol>

          {remaining.length > 0 && (
            <section className="mt-6" aria-label="היחידות שעוד לפנינו">
              <p className="text-center font-display text-base font-bold text-[color:var(--primary)]/70">
                עוד {remaining.length} יחידות — עוד {remaining.length} סעיפים
              </p>
              <ul className="mt-3 grid gap-2">
                {remaining.map((u, i) => (
                  <li
                    key={u.ref}
                    className="flex items-center gap-3 rounded-xl border-2 border-dashed border-[#d9c3a5] px-3 py-2.5 text-xs text-[color:var(--foreground)]/45"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#d9c3a5] font-bold">
                      {clauses.length + i + 1}
                    </span>
                    <span className="truncate">{u.unit ? `${u.unit} — ` : ""}{u.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
        <div aria-hidden className="mx-2 h-5 rounded-full bg-gradient-to-b from-[#8a5c37] via-[#d8b48a] to-[#a7774f] shadow-md" />
      </div>

      {/* proposals for the next clause */}
      <section className="mx-auto mt-10 max-w-3xl">
        <h2 className="font-display text-xl font-bold text-[color:var(--primary)]">💡 הצעות לסעיף הבא</h2>
        <p className="mb-4 mt-1 text-sm text-[color:var(--foreground)]/60">
          ההצעות נכתבות בדפי העבודה, בשאלות ״מהפסוק לבית הספר · אמנת הכיתה״. כאן מופיעות ההצעות שהמורה בחרה להציג לכיתה.
        </p>
        {proposals.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)]/70 px-6 py-8 text-center text-sm text-[color:var(--foreground)]/55">
            עוד אין הצעות שהוצגו לכיתה.
          </p>
        ) : (
          <ProposalsBoard initial={proposals} canVote={!isTeacher} />
        )}
      </section>
    </PageShell>
  );
}
