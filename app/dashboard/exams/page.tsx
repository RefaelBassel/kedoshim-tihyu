import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import ExamList from "@/components/dashboard/exam-list";
import { EXAM_STATUS_LABEL, formatExamDate, listExams, totalPoints } from "@/lib/exams";
import { getPrepForExam } from "@/lib/exam-prep";
import { formatHebDateTime } from "@/lib/hebrew";

// Teacher-only: the exams she composed with Claude. Students are kept out
// by the role check here and by the teacher guard on every /api/exams route.
export default async function ExamsDashboardPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const exams = await listExams();
  const preps = new Map((await Promise.all(exams.map((e) => getPrepForExam(e.id)))).filter((p) => p != null).map((p) => [p.examId, p]));

  return (
    <PageShell title="מבחנים" subtitle="מבחנים, מחוונים ודפי הכנה — לעיני המורה בלבד">
      <div className="mx-auto max-w-3xl space-y-6">
        {exams.length > 0 && (
          <ul className="space-y-3">
            {exams.map((e) => {
              const prep = preps.get(e.id);
              return (
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
                      🔒 {EXAM_STATUS_LABEL[e.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--primary)]/60">
                    {e.doc.examDate && <b className="text-[color:var(--accent)]">📅 {formatExamDate(e.doc.examDate)} · </b>}
                    {e.doc.sections.reduce((a, s) => a + s.questions.length, 0)} שאלות · {totalPoints(e.doc)} נק׳ · {e.doc.durationMin} דק׳ · עודכן{" "}
                    {formatHebDateTime(e.updatedAt)}
                  </p>
                  <p className="mt-1 text-xs font-bold">
                    {prep ? (
                      prep.status === "published" ? (
                        <span className="text-[color:var(--success)]">📚 דף ההכנה מפורסם לתלמידים</span>
                      ) : (
                        <span className="text-[color:var(--warning)]">📚 דף ההכנה — טיוטה, מוסתר מהתלמידים</span>
                      )
                    ) : (
                      <span className="text-[color:var(--primary)]/50">📚 עוד אין דף הכנה</span>
                    )}
                  </p>
                </Link>
              </li>
              );
            })}
          </ul>
        )}
        <ExamList hasExams={exams.length > 0} />
        <p className="text-center text-xs text-[color:var(--primary)]/50">
          <Link href="/dashboard" className="hover:text-[color:var(--accent)]">
            → חזרה לדשבורד
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
