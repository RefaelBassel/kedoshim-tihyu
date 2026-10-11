import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { getExam, totalPoints } from "@/lib/exams";
import PrintButton from "@/components/dashboard/print-button";

// The printable exam: ?v=student (blank answer space) or ?v=teacher (with
// the expected answers). Teacher-only like the rest of /dashboard.
export default async function ExamPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const { examId } = await params;
  const { v } = await searchParams;
  const teacher = v === "teacher";
  const exam = await getExam(Number(examId));
  if (!exam) notFound();
  const doc = exam.doc;

  return (
    <div className="exam-print mx-auto max-w-3xl px-6 py-8 text-black" dir="rtl">
      <style>{`
        @media print {
          header, footer, nav, .no-print { display: none !important; }
          .exam-print { max-width: none; padding: 0; }
          .exam-print section { break-inside: avoid; }
          .answer-lines { border-bottom: 1px solid #999; }
        }
        .answer-lines { height: 1.9rem; border-bottom: 1px solid #bbb; }
      `}</style>
      <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-xs">
        <span className="font-bold text-[color:var(--primary)]">{teacher ? "גרסת מורה — עם תשובות" : "גרסת תלמיד"}</span>
        <PrintButton />
      </div>

      <header className="border-b-2 border-black pb-3">
        <p className="text-xs">תיכון שחרית · בית מדרש תורה שבכתב · כיתה ט</p>
        <h1 className="mt-1 text-2xl font-extrabold">{doc.title}</h1>
        {doc.subtitle && <p className="text-sm">{doc.subtitle}</p>}
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <span>שם: ______________________</span>
          <span>כיתה: ________</span>
          <span>תאריך: ____________</span>
          <span>משך: {doc.durationMin} דק׳</span>
          <span>סה״כ: {totalPoints(doc)} נק׳</span>
        </div>
        {doc.instructions && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{doc.instructions}</p>}
      </header>

      {doc.sections.map((s, si) => {
        const pts = s.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
        return (
          <section key={s.key} className="mt-6">
            <h2 className="text-lg font-extrabold">
              {s.title.trim().startsWith("חלק") ? s.title : `חלק ${si + 1}: ${s.title}`}{" "}
              <span className="text-sm font-bold">({pts} נק׳)</span>
            </h2>
            {s.intro && <p className="text-sm leading-6">{s.intro}</p>}
            <ol className="mt-2 space-y-4">
              {s.questions.map((q, qi) => (
                <li key={q.id} className="text-[15px] leading-7">
                  <div className="flex gap-2">
                    <span className="font-extrabold">{qi + 1}.</span>
                    <div className="flex-1">
                      {q.verse && (
                        <p className="my-1 rounded border border-black/30 px-3 py-2 text-[17px] leading-9">
                          <span className="me-1 text-xs font-bold">({q.verseNum})</span>
                          {q.verse}
                        </p>
                      )}
                      <p>
                        {q.text} <span className="text-xs font-bold">({q.points} נק׳)</span>
                      </p>
                      {teacher ? (
                        <p className="mt-1 whitespace-pre-wrap rounded bg-black/5 px-3 py-2 text-sm leading-6">✔ {q.answer}</p>
                      ) : (
                        <div className="mt-1">
                          {Array.from({ length: s.key === "pshat" || s.key === "quotes" ? 2 : s.key === "etnachta" ? 3 : s.key === "argument" ? 10 : 5 }).map((_, i) => (
                            <div key={i} className="answer-lines" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      <p className="mt-8 text-center text-sm font-bold">בהצלחה!</p>
    </div>
  );
}
