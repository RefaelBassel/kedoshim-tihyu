import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell, { ComingSoon } from "@/components/page-shell";
import ExamPrepView from "@/components/exam-prep-view";
import { listPublishedPreps } from "@/lib/exam-prep";

// Students: the exam preparations the teacher published (never the exams).
export default async function ExamsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const preps = await listPublishedPreps();
  return (
    <PageShell title="הכנות למבחנים" subtitle="מה צריך לדעת, איך מתכוננים, ותרגול עם תשובות לבדיקה עצמית">
      {preps.length === 0 ? (
        <ComingSoon note="ההכנה תעלה לכאן על ידי המורה לקראת המבחן." />
      ) : (
        <div className="space-y-10">
          {preps.map((p) => (
            <ExamPrepView key={p.id} prepId={p.id} doc={p.doc} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
