import Link from "next/link";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { formatExamDate, getExam, questionNumbers, totalPoints } from "@/lib/exams";
import { linesForQuestion } from "@/lib/exam-export-shared";
import PrintButton from "@/components/dashboard/print-button";

// The printable exam: ?v=student (clean — no answers, lines to write on) or
// ?v=teacher (the answer key). Teacher-only like the rest of /dashboard.
// The site's own header/nav/footer are hidden in print; the exam's head is a
// <div>, not a <header>, so it is never hidden with them.
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
  const nums = questionNumbers(doc);
  const date = formatExamDate(doc.examDate);

  return (
    <div className="exam-print mx-auto w-full max-w-3xl px-6 py-8 text-black" dir="rtl">
      <style>{`
        @media print {
          body > header, body > footer, nav, .no-print { display: none !important; }
          .exam-print { max-width: none; padding: 0; }
          .exam-q { break-inside: avoid; }
          @page { size: A4; margin: 1.6cm; }
        }
        .answer-line { height: 2rem; border-bottom: 1px solid #aaa; }
      `}</style>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-xs">
        <span className="font-bold text-[color:var(--primary)]">
          {teacher ? "🔑 מחוון — למורה בלבד" : "גרסת תלמיד — בלי תשובות"}
          {exam.status === "draft" && <span className="ms-2 text-[color:var(--warning)]">(טיוטה — המחוון עוד לא אושר)</span>}
        </span>
        <span className="flex items-center gap-3">
          <Link href={`/dashboard/exams/${exam.id}/print?v=${teacher ? "student" : "teacher"}`} className="font-bold text-[color:var(--primary)]/70 hover:text-[color:var(--accent)]">
            {teacher ? "לגרסת התלמיד" : "למחוון"}
          </Link>
          <PrintButton />
        </span>
      </div>

      <div className="border-b-2 border-black pb-3">
        <p className="text-xs">תיכון שחרית · בית מדרש תורה שבכתב · כיתה ט</p>
        <h1 className="mt-1 text-2xl font-extrabold">
          {doc.title}
          {teacher && <span className="ms-2 text-base">— מחוון</span>}
        </h1>
        {doc.subtitle && <p className="text-sm">{doc.subtitle}</p>}
        {!teacher && (
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span>שם: ______________________</span>
            <span>כיתה: ________</span>
            <span>תאריך: {date || "____________"}</span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-8 text-sm">
          {teacher && date && <span>תאריך: {date}</span>}
          <span>משך: {doc.durationMin} דקות</span>
          <span>סה״כ: {totalPoints(doc)} נקודות</span>
        </div>
        {doc.instructions && <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-6">{doc.instructions}</p>}
      </div>

      {doc.sections.map((s, si) => {
        const pts = s.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
        return (
          <section key={s.key} className="mt-6">
            <h2 className="text-lg font-extrabold">
              {s.title.trim().startsWith("חלק") ? s.title : `חלק ${si + 1}: ${s.title}`} <span className="text-sm font-bold">({pts} נק׳)</span>
            </h2>
            {s.intro && <p className="text-sm leading-6">{s.intro}</p>}
            <ol className="mt-2 space-y-5">
              {s.questions.map((q) => (
                <li key={q.id} className="exam-q text-[15px] leading-7">
                  <div className="flex gap-2">
                    <span className="font-extrabold">{nums.get(q.id)}.</span>
                    <div className="flex-1">
                      {q.verse && (
                        <p className="font-mikra my-1 rounded border border-black/30 px-3 py-2 text-[18px] leading-9">
                          <span className="me-1 text-xs font-bold">({q.verseNum})</span>
                          {q.verse}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">
                        {q.text} <span className="text-xs font-bold">({q.points} נק׳)</span>
                      </p>
                      {teacher ? (
                        <p className="mt-1 whitespace-pre-wrap rounded bg-black/5 px-3 py-2 text-sm leading-6">✔ {q.answer}</p>
                      ) : (
                        <div className="mt-1">
                          {Array.from({ length: linesForQuestion(s.key, q) }).map((_, i) => (
                            <div key={i} className="answer-line" />
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
      {!teacher && <p className="mt-8 text-center text-sm font-bold">בהצלחה!</p>}
    </div>
  );
}
