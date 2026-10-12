import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell, { ComingSoon } from "@/components/page-shell";
import ExamPrepView from "@/components/exam-prep-view";
import { REVEAL_AFTER, earnedExplains, listPublishedPreps, progressFor, studentView } from "@/lib/exam-prep";
import { daysUntil } from "@/lib/prep-shared";

// Students: the exam preparations the teacher published (never the exams,
// never the answers until earned).
export default async function ExamsPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  const userId = Number(user.id);
  const preps = await listPublishedPreps();
  const views = await Promise.all(
    preps.map(async (p) => {
      const view = await studentView(p);
      const progress = await progressFor(p, userId);
      return { view, progress, explains: earnedExplains(p, progress) };
    })
  );
  return (
    <PageShell title="הכנות למבחנים" subtitle="מפת הפרק, ביטויים, תרגול עם בדיקה מיידית ותרגול טיעון">
      {views.length === 0 ? (
        <ComingSoon note="ההכנה תעלה לכאן על ידי המורה לקראת המבחן." />
      ) : (
        <div className="space-y-12">
          {views.map(({ view, progress, explains }) => (
            <ExamPrepView
              key={view.id}
              prep={view}
              progress={progress}
              explains={explains}
              daysLeft={daysUntil(view.examDate)}
              revealAfter={REVEAL_AFTER}
              addressForm={user.addressForm ?? null}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
