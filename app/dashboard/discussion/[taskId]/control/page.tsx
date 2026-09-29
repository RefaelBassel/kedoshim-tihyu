import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import TopNav from "@/components/top-nav";
import { getTask } from "@/lib/tasks";
import { getOrCreateDiscussion } from "@/lib/discussion";
import DiscussionControl from "@/components/discussion/control";

// The teacher's control page for the debate — her phone or laptop screen,
// separate from the projected board. Teacher only.
export default async function DiscussionControlPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");
  const { taskId } = await params;
  const task = await getTask(Number(taskId));
  if (!task) notFound();
  const id = await getOrCreateDiscussion(task.id, Number(user.id));
  return (
    <>
      <TopNav />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 pt-6 text-center">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-[color:var(--accent)]">
            🎛️ בקרת הדיון
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[color:var(--primary)]">
            {task.title}
          </h1>
        </div>
        <DiscussionControl discussionId={id} />
      </main>
    </>
  );
}
