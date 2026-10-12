import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import LessonPlanner from "@/components/dashboard/lesson-planner";

// מהלך השיעור — the teacher's one screen for the lesson itself, NOT under
// any task: today's plan on top, the whole journey below with each unit's
// status and its three tools on the row. Once started, the strip at the top
// of every page carries the plan with her.
export default async function LessonPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");

  return (
    <PageShell
      title="מהלך השיעור"
      subtitle="מגלגלים, מסדרים, ▶"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex justify-center">
          <a
            href="/dashboard/slide"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-2 border-[color:var(--primary)]/50 px-5 py-2 text-sm font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10"
          >
            🪧 שקופית כללים ↗
          </a>
        </div>
        <LessonPlanner />
      </div>
    </PageShell>
  );
}
