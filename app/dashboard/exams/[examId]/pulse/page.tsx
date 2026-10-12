import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import ExamPulseView from "@/components/dashboard/exam-pulse";
import { examPulse } from "@/lib/exam-pulse";

// Teacher-only "דופק כיתה": the class's exam readiness at a glance. Students
// are redirected away; the data is rendered here only (no student-facing API).
export const dynamic = "force-dynamic";

export default async function ExamPulsePage({ params }: { params: Promise<{ examId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const { isStudentMode } = await import("@/lib/student-mode");
  if (await isStudentMode()) redirect("/");
  const { examId } = await params;
  const pulse = await examPulse(Number(examId));
  if (!pulse) notFound();
  return (
    <PageShell title={`💓 דופק כיתה — ${pulse.title}`} subtitle="איפה כל הכיתה עומדת בהכנה למבחן — מתעדכן כל דקה">
      <ExamPulseView pulse={pulse} />
    </PageShell>
  );
}
