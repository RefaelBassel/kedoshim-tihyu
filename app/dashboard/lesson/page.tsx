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
      subtitle="🔁 חזרה (5) · 💬 דיון (15) · 📖 לימוד (20) — בסדר שאת בוחרת, על היחידות שאת בוחרת. הדיון והחזרה על יחידה שכבר נלמדה; הלימוד על הבאה."
    >
      <div className="mx-auto max-w-4xl">
        <LessonPlanner />
      </div>
    </PageShell>
  );
}
