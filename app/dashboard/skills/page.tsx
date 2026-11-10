import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import SkillsReportView from "@/components/dashboard/skills-report";
import { skillsReport } from "@/lib/skills-report";
import { allTasksWithStats } from "@/lib/tasks";
import { israelLocalToUnix } from "@/lib/hebrew";

// Teacher-only skills report (issue #29): per student and skill group, from the
// lenient answer checks of every published task. Students are redirected away.
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SkillsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const { isStudentMode } = await import("@/lib/student-mode");
  if (await isStudentMode()) redirect("/");

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const ref = one("ref");
  const from = DATE.test(one("from")) ? one("from") : "";
  const to = DATE.test(one("to")) ? one("to") : "";

  const [report, tasks] = await Promise.all([
    skillsReport({
      refs: ref ? [ref] : undefined,
      from: from ? israelLocalToUnix(from, "00:00") : undefined,
      to: to ? israelLocalToUnix(to, "23:59") : undefined,
    }),
    allTasksWithStats(),
  ]);
  const seen = new Set<string>();
  const units = tasks.filter((t) => !seen.has(t.contentRef) && seen.add(t.contentRef)).map((t) => ({ ref: t.contentRef, title: t.title }));

  return (
    <PageShell title="🧭 דוח מיומנויות" subtitle="איך כל תלמיד עומד בכל מיומנות של התוכנית — לעיני המורה בלבד">
      <SkillsReportView report={report} units={units} filter={{ ref, from, to }} />
      <p className="mt-6 flex justify-center gap-4 text-center text-xs text-[color:var(--primary)]/50">
        <Link href="/dashboard/grades/vayikra-16" className="hover:text-[color:var(--accent)]">
          📊 ציון ביניים — פרק ט״ז
        </Link>
        <Link href="/dashboard" className="hover:text-[color:var(--accent)]">
          → חזרה לדשבורד
        </Link>
      </p>
    </PageShell>
  );
}
