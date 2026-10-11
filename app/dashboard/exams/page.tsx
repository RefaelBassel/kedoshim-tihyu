import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import ExamList from "@/components/dashboard/exam-list";
import { listExams, totalPoints } from "@/lib/exams";
import { formatHebDateTime } from "@/lib/hebrew";

// Teacher-only: the exams she composed with Claude. Students are kept out
// by the role check here and by the teacher guard on every /api/exams route.
export default async function ExamsDashboardPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const exams = await listExams();

  return (
    <PageShell title="מבחנים" subtitle="חיבור עם קלוד, עריכה, והדפסה — לעיני המורה בלבד">
      <div className="mx-auto max-w-3xl space-y-6">
        <ExamList hasExams={exams.length > 0} />
        {exams.length > 0 && (
          <ul className="space-y-3">
            {exams.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/dashboard/exams/${e.id}`}
                  className="block rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 transition hover:border-[color:var(--accent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-base font-extrabold text-[color:var(--primary)]">{e.title}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        e.status === "ready"
                          ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                          : "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"
                      }`}
                    >
                      {e.status === "ready" ? "מוכן להדפסה" : "טיוטה"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--primary)]/60">
                    {e.doc.sections.length} חלקים · {e.doc.sections.reduce((a, s) => a + s.questions.length, 0)} שאלות ·{" "}
                    {totalPoints(e.doc)} נק׳ · עודכן {formatHebDateTime(e.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-center text-xs text-[color:var(--primary)]/50">
          <Link href="/dashboard" className="hover:text-[color:var(--accent)]">
            → חזרה לדשבורד
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
