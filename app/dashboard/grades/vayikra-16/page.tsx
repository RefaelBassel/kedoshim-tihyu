import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import InterimGradesView from "@/components/dashboard/interim-grades";
import { interimGrades } from "@/lib/interim-grades";

// Teacher-only interim grade of ויקרא ט״ז (issue #17): Claude's lenient check
// of every answer, a proposed grade per task and per student. Students are
// redirected away; nothing here reaches them unless the teacher publishes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function InterimGradesPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const { isStudentMode } = await import("@/lib/student-mode");
  if (await isStudentMode()) redirect("/");
  const grades = await interimGrades();
  return (
    <PageShell title="📊 ציון ביניים — פרק ט״ז" subtitle="הצעת ציון לכל תלמיד, לפי בדיקה מקלה של התוכן של כל התשובות — לעיני המורה בלבד">
      <InterimGradesView grades={grades} />
      <p className="mt-6 text-center text-xs text-[color:var(--primary)]/50">
        <Link href="/dashboard" className="hover:text-[color:var(--accent)]">
          → חזרה לדשבורד
        </Link>
      </p>
    </PageShell>
  );
}
