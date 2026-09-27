import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getTask } from "@/lib/tasks";
import { getTaskContent } from "@/content/tasks/registry";
import { effectiveContent } from "@/lib/content-overrides";
import ReviewDeckPlayer from "@/components/review-deck";

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

  return (
    <ReviewDeckPlayer
      taskId={task.id}
      contentRef={content.ref}
      title={content.title}
      bookRef={content.bookRef}
      review={content.review ?? null}
      discussion={content.discussion ?? null}
    />
  );
}
