import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PrintOnLoad from "@/components/dashboard/print-on-load";
import PrintButton from "@/components/dashboard/print-button";
import { listClauses, type Clause } from "@/lib/amana";

// "גרסה לעיצוב" — the approved clauses only, on a clean page for designing
// and hanging in the classrooms: ?size=a4 (default) or a3 (poster).
// Teacher only. Opens the print dialog on load (?auto=0 skips it).
export default async function AmanaPrintPage({ searchParams }: { searchParams: Promise<{ size?: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher" || user.guest) redirect("/amana");
  const size = (await searchParams).size === "a3" ? "a3" : "a4";

  let clauses: Clause[] = [];
  try {
    clauses = (await listClauses()).filter((c) => c.status === "approved");
  } catch {
    // DB not ready
  }
  const poster = size === "a3";

  return (
    <div className="amana-print mx-auto w-full max-w-4xl px-6 py-8 text-black" dir="rtl">
      <style>{`
        @media print {
          body > *:not(.amana-print) { display: none !important; }
          .no-print { display: none !important; }
          .amana-print { max-width: none; padding: 0; background: #fff !important; }
          .amana-clause { break-inside: avoid; page-break-inside: avoid; }
          @page { size: ${poster ? "A3" : "A4"}; margin: ${poster ? "2.5cm" : "2cm"}; }
        }
      `}</style>
      <PrintOnLoad />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-xs">
        <span className="font-bold text-[color:var(--primary)]">🖨️ אמנת הכיתה — גרסה לעיצוב (סעיפים מאושרים בלבד)</span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-full border border-[color:var(--border)] p-0.5 font-bold">
            <Link href="?size=a4&auto=0" aria-current={!poster ? "page" : undefined} className={`rounded-full px-3 py-1 ${!poster ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--primary)]/70"}`}>
              A4
            </Link>
            <Link href="?size=a3&auto=0" aria-current={poster ? "page" : undefined} className={`rounded-full px-3 py-1 ${poster ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--primary)]/70"}`}>
              פוסטר A3
            </Link>
          </span>
          <a href="/api/amana/export" className="font-bold text-[color:var(--primary)] underline-offset-2 hover:underline">📄 ייצוא טקסט</a>
          <PrintButton />
        </span>
      </div>

      <header className="text-center">
        <h1 className={`font-display font-extrabold ${poster ? "text-6xl" : "text-4xl"}`}>אמנת הכיתה</h1>
        <p className={`mt-2 font-display font-bold ${poster ? "text-3xl" : "text-xl"}`}>קדושים תהיו · כיתות ט · תיכון שחרית</p>
        <div className="mx-auto mt-4 h-0.5 w-48 bg-black" />
      </header>

      {clauses.length === 0 ? (
        <p className="mt-12 text-center text-lg">עוד אין סעיפים מאושרים. כשסעיף יקבל סטטוס ״אושר״ הוא יופיע כאן.</p>
      ) : (
        <ol className={poster ? "mt-12 space-y-10" : "mt-8 space-y-6"}>
          {clauses.map((c, i) => (
            <li key={c.id} className="amana-clause flex gap-5">
              <span className={`shrink-0 font-display font-extrabold ${poster ? "w-14 text-5xl" : "w-9 text-3xl"}`}>{i + 1}.</span>
              <div>
                <p className={`font-display font-bold leading-snug ${poster ? "text-4xl" : "text-2xl"}`}>{c.text}</p>
                {(c.verseQuote || c.verseSource) && (
                  <p className={`mt-1.5 ${poster ? "text-2xl" : "text-base"}`}>
                    {c.verseQuote && <span className="font-mikra">״{c.verseQuote}״</span>} {c.verseSource && <span>({c.verseSource})</span>}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
