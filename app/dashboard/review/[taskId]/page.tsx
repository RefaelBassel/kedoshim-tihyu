import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getTask } from "@/lib/tasks";
import { getTaskContent } from "@/content/tasks/registry";
import { effectiveContent } from "@/lib/content-overrides";
import ReviewDeckPlayer from "@/components/review-deck";
import LessonFollower from "@/components/lesson-follower";

// מצגת החזרה of a unit — teacher only, chrome-free (the player is a fixed
// full-viewport overlay). Uses the teacher-edited content.
export default async function ReviewDeckPage({
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
  const baseReg = getTaskContent(task.content_ref);
  if (!baseReg) notFound();
  const content = await effectiveContent(baseReg.content);
  // showing the deck counts as "reviewed" on the journey
  const { recordUnitEvent, getPlan } = await import("@/lib/lesson-plan");
  await recordUnitEvent(task.id, "review");
  // is this deck the block running right now? then its last slide flows on
  const plan = await getPlan();
  const cur = plan.current >= 0 ? plan.blocks[plan.current] : null;
  const isCurrent = !!cur && cur.kind === "review" && cur.taskId === task.id;
  const { nextIndex } = await import("@/lib/lesson-flow");
  const nxt = isCurrent ? (plan.blocks[nextIndex(plan)] ?? null) : null;

  return (
    <>
      <ReviewDeckPlayer
        taskId={task.id}
        contentRef={content.ref}
        title={content.title}
        bookRef={content.bookRef}
        review={content.review ?? null}
        discussion={content.discussion ?? null}
        flow={isCurrent ? { next: nxt ? { kind: nxt.kind, taskId: nxt.taskId, title: nxt.title } : null } : null}
      />
      <LessonFollower kind="review" taskId={task.id} />
    </>
  );
}
