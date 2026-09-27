import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getTask } from "@/lib/tasks";
import { getOrCreateDiscussion } from "@/lib/discussion";
import DiscussionBoard from "@/components/discussion/board";

// The projected debate board — teacher only, chrome-free, input-free. Opens
// (or resumes) the task's discussion so that either surface can be opened
// first.
export default async function DiscussionBoardPage({
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
  return <DiscussionBoard discussionId={id} />;
}
