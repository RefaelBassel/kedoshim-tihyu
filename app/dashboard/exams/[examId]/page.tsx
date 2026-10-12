import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import ExamEditor from "@/components/dashboard/exam-editor";
import { getExam } from "@/lib/exams";
import { CHAPTER_UNIT_REFS, discussionQuestions, getPrepForExam, prepClassProgress } from "@/lib/exam-prep";
import ExamPrepEditor from "@/components/dashboard/exam-prep-editor";

export default async function ExamEditorPage({ params }: { params: Promise<{ examId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const { examId } = await params;
  const exam = await getExam(Number(examId));
  if (!exam) notFound();
  const prep = await getPrepForExam(exam.id);
  const progress = prep ? await prepClassProgress(prep) : null;
  const discussions = await discussionQuestions(CHAPTER_UNIT_REFS);
  return (
    <PageShell title={exam.title} subtitle="המבחן המלא ומחוון לצידו — כל שינוי נשמר מעצמו; התלמידים לא רואים את המבחן">
      <ExamEditor exam={exam} />
      <ExamPrepEditor examId={exam.id} initial={prep} progress={progress} discussions={discussions} />
    </PageShell>
  );
}
