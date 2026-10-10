import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTask } from "@/lib/tasks";
import { getTaskContent } from "@/content/tasks/registry";
import { getOpening } from "@/content/openings/registry";
import { effectiveContent } from "@/lib/content-overrides";
import OpeningDeckPlayer from "@/components/opening-deck";

// מצגת הפתיחה of a unit — teacher only, chrome-free (the player is a fixed
// full-viewport overlay). The segment is a task id, or the unit's content
// ref when it is not published yet (then the last slide returns to the
// lesson page instead of opening the class board).
export default async function OpeningDeckPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");

  const { taskId: raw } = await params;
  let taskId: number | null = null;
  let ref: string;
  if (/^\d+$/.test(raw)) {
    const task = await getTask(Number(raw));
    if (!task) notFound();
    taskId = task.id;
    ref = task.content_ref;
  } else {
    ref = decodeURIComponent(raw);
    const res = await db().execute({ sql: "SELECT id FROM tasks WHERE content_ref = ? ORDER BY id DESC LIMIT 1", args: [ref] });
    if (res.rows.length) taskId = Number(res.rows[0].id);
  }

  const deck = getOpening(ref);
  const baseReg = getTaskContent(ref);
  if (!deck || !baseReg) notFound();
  const content = await effectiveContent(baseReg.content);

  return <OpeningDeckPlayer deck={deck} title={content.title} taskId={taskId} />;
}
