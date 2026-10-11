import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import ExamEditor from "@/components/dashboard/exam-editor";
import { getExam } from "@/lib/exams";

export default async function ExamEditorPage({ params }: { params: Promise<{ examId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const { examId } = await params;
  const exam = await getExam(Number(examId));
  if (!exam) notFound();
  return (
    <PageShell title={exam.title} subtitle="עריכת המבחן — כל שינוי נשמר בלחיצה; התלמידים לא רואים כלום">
      <ExamEditor exam={exam} />
    </PageShell>
  );
}
