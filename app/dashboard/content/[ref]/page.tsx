import Link from "next/link";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import PageShell from "@/components/page-shell";
import { getTaskContent, positionLabel } from "@/content/tasks/registry";
import { getOverrides, applyOverrides, EMPTY_EDITS } from "@/lib/content-overrides";
import { db } from "@/lib/db";
import WorksheetEditor from "@/components/task/worksheet-editor";
import { ReviewEditor } from "@/components/dashboard/unit-text-editors";

// One unit, all its teacher-owned content on one page: the worksheet
// editor (every section), the discussion question and the review deck.
// The same editors also appear in place on the task page.
export default async function ContentEditPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");

  const { ref } = await params;
  const reg = getTaskContent(ref);
  if (!reg) notFound();
  const ov = await getOverrides(ref);
  const content = applyOverrides(reg.content, ov);

  const t = await db().execute({
    sql: "SELECT id FROM tasks WHERE content_ref = ? ORDER BY id DESC LIMIT 1",
    args: [ref],
  });
  const taskId = t.rows[0] ? Number(t.rows[0].id) : null;

  return (
    <PageShell title={content.title} subtitle={`${positionLabel(ref) ?? content.bookRef} · תוכן היחידה`}>
      <div className="mx-auto max-w-3xl space-y-8">
        <p className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/dashboard/content" className="font-semibold text-[color:var(--accent)] hover:underline">
            → לכל היחידות
          </Link>
          {taskId != null && (
            <Link href={`/tasks/${taskId}`} className="font-semibold text-[color:var(--primary)] hover:underline">
              👀 המשימה כפי שהכיתה רואה
            </Link>
          )}
        </p>

        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
          <h2 className="font-display text-lg font-extrabold text-[color:var(--primary)]">
            🔁 מצגת החזרה ו-💬 שאלת הדיון
            {(ov.review || ov.discussion) && <EditedTag />}
          </h2>
          <p className="mb-3 text-xs text-[color:var(--foreground)]/60">
            נקודות החזרה (שקף לכל שורה), המיומנות, ושאלת הדיון שסוגרת את המצגת ועולה על לוח הדיון.
            ידנית — או בבקשה מקלוד.
          </p>
          <ReviewEditor
            contentRef={ref}
            initial={content.review ?? null}
            initialDiscussion={content.discussion ?? null}
          />
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-extrabold text-[color:var(--primary)]">
            📝 שאלות דף העבודה
            {ov.worksheet && <EditedTag />}
          </h2>
          <WorksheetEditor
            contentRef={ref}
            sections={reg.content.sections}
            edits={ov.worksheet ?? EMPTY_EDITS}
          />
        </section>
      </div>
    </PageShell>
  );
}

function EditedTag() {
  return (
    <span className="ms-2 align-middle rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[color:var(--accent)]">
      ✏️ נערך ידנית
    </span>
  );
}
