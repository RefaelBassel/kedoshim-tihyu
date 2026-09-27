import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import { TASK_REGISTRY, positionLabel } from "@/content/tasks/registry";
import { getOverrides, applyOverrides } from "@/lib/content-overrides";

// תוכן היחידות — one place to read and edit, for every unit in the library,
// what the teacher owns: the worksheet questions (hide / reword / add), the
// unit's discussion question and the review deck. Defaults come from the
// files; anything edited here (or in place on the task page) is marked and
// wins.
export default async function ContentHubPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");

  const rows = await Promise.all(
    Object.entries(TASK_REGISTRY).map(async ([ref, reg]) => {
      const ov = await getOverrides(ref);
      const c = applyOverrides(reg.content, ov);
      const questions = c.sections.reduce(
        (n, s) => n + s.blocks.filter((b) => b.type === "question").length,
        0
      );
      return {
        ref,
        title: c.title,
        position: positionLabel(ref),
        questions,
        hidden: ov.worksheet?.hidden.length ?? 0,
        added: ov.worksheet?.extra.length ?? 0,
        hasDiscussion: Boolean(c.discussion?.question),
        hasReview: Boolean(c.review?.points?.length),
        edited: Object.keys(ov),
      };
    })
  );

  return (
    <PageShell
      title="תוכן היחידות"
      subtitle="שאלות דף העבודה, שאלת הדיון ומצגת החזרה — לכל יחידה. מה שכתוב הוא ברירת מחדל; כל מה שתערכי גובר עליו"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        {rows.map((r) => (
          <Link
            key={r.ref}
            href={`/dashboard/content/${r.ref}`}
            className="block rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 transition hover:border-[color:var(--accent)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-[color:var(--primary)]">{r.title}</p>
                {r.position && <p className="text-xs text-[color:var(--primary)]/55">{r.position}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                <span className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[color:var(--primary)]">
                  📝 {r.questions} שאלות
                  {r.hidden > 0 && ` · ${r.hidden} מוסתרות`}
                  {r.added > 0 && ` · ${r.added} שלך`}
                </span>
                <Pill ok={r.hasDiscussion} label="💬 שאלת דיון" />
                <Pill ok={r.hasReview} label="🔁 מצגת חזרה" />
                {r.edited.length > 0 && (
                  <span className="rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 text-[color:var(--accent)]">
                    ✏️ נערך ידנית
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${
        ok
          ? "bg-[color:var(--success)]/12 text-[color:var(--success)]"
          : "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"
      }`}
    >
      {label}
      {!ok && " — חסר"}
    </span>
  );
}
