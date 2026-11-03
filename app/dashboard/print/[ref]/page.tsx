import Link from "next/link";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { getTaskContent, positionLabel } from "@/content/tasks/registry";
import type { PassageBlock, PassageVerse, QuestionBlock } from "@/content/tasks/types";
import { effectiveContent } from "@/lib/content-overrides";
import { autoVersesFor } from "@/lib/auto-verses";
import { chapterLabel, chapterLength, formatVerseNums, isNoVerses, parseVerseSpec, versesForSpec } from "@/lib/verse-spec";
import { db } from "@/lib/db";
import { getAnswers, getTask } from "@/lib/tasks";
import { formatHebDate } from "@/lib/hebrew";
import PrintButton from "@/components/dashboard/print-button";
import PrintOnLoad from "@/components/dashboard/print-on-load";

// The clean printable worksheet of one unit: /dashboard/print/<ref> (a task id
// works too). Works for units that were never published — it reads the
// registry content with the teacher's edits applied (hidden questions gone,
// added ones in). ?verses=0 prints without the pinned verses; ?student=<id>
// &task=<id> prints one student's submission (their answers in place of the
// writing lines). Teacher-only; the site chrome is hidden in print.
const LINES_FIELD = 3;
const LINES_LONG = 6;

type VerseBox = { ref: string; verses: PassageVerse[] };

function pinnedBox(chapter: PassageBlock, spec: string | undefined): VerseBox | null {
  if (!spec?.trim() || isNoVerses(spec)) return null;
  const verses = versesForSpec(spec, chapter.verses);
  if (!verses.length) return null;
  const nums = parseVerseSpec(spec).nums.filter((n) => n <= chapterLength(chapter.verses));
  return { ref: `${chapterLabel(chapter.ref)}, ${formatVerseNums(nums)}`, verses };
}

export default async function PrintWorksheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ verses?: string; student?: string; task?: string; auto?: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/");

  const { ref: rawRef } = await params;
  const sp = await searchParams;
  let ref = decodeURIComponent(rawRef);
  if (/^\d+$/.test(ref)) {
    const t = await getTask(Number(ref));
    if (!t) notFound();
    ref = t.content_ref;
  }
  const reg = getTaskContent(ref);
  if (!reg) notFound();
  const content = await effectiveContent(reg.content);
  const auto = autoVersesFor(content, reg.mainPassage);
  const withVerses = sp.verses !== "0";

  // one student's submission (optional)
  let studentName: string | null = null;
  let studentClass: string | null = null;
  let answers: Record<string, string> | null = null;
  let submittedAt: number | null = null;
  if (sp.student) {
    const studentId = Number(sp.student);
    const taskId = Number(sp.task);
    const task = Number.isFinite(taskId) ? await getTask(taskId) : null;
    if (!Number.isFinite(studentId) || !task || task.content_ref !== ref) notFound();
    const u = await db().execute({
      sql: "SELECT full_name, email, class FROM users WHERE id = ?",
      args: [studentId],
    });
    const row = u.rows[0];
    if (!row) notFound();
    studentName = (row.full_name as string | null) || String(row.email);
    studentClass = (row.class as string | null) || null;
    answers = await getAnswers(taskId, studentId);
    const p = await db().execute({
      sql: "SELECT submitted_at FROM task_progress WHERE task_id = ? AND user_id = ?",
      args: [taskId, studentId],
    });
    submittedAt = p.rows[0]?.submitted_at != null ? Number(p.rows[0].submitted_at) : null;
  }

  const baseQuery = new URLSearchParams();
  if (sp.student) baseQuery.set("student", sp.student);
  if (sp.task) baseQuery.set("task", sp.task);
  const toggleHref = (v: boolean) => {
    const q = new URLSearchParams(baseQuery);
    if (!v) q.set("verses", "0");
    q.set("auto", "0");
    return `/dashboard/print/${encodeURIComponent(rawRef)}?${q.toString()}`;
  };

  let n = 0;
  const lines = (count: number) =>
    Array.from({ length: count }).map((_, i) => <div key={i} className="ws-line" />);
  const answerBox = (label: string | null, key: string, emptyLines: number) => {
    const value = answers?.[key]?.trim();
    return (
      <div key={key} className="mt-2">
        {label && <p className="text-sm font-bold">{label}</p>}
        {answers ? (
          value ? (
            <p className="ws-answer whitespace-pre-wrap text-[15px] leading-7">{value}</p>
          ) : (
            <p className="text-sm">(לא נענתה)</p>
          )
        ) : (
          lines(emptyLines)
        )}
      </div>
    );
  };

  return (
    <div className="ws-print mx-auto w-full max-w-3xl px-6 py-8 text-black" dir="rtl">
      <style>{`
        .ws-line { height: 2rem; border-bottom: 1px solid #000; }
        .ws-answer { border-bottom: 1px solid #000; padding-bottom: .25rem; }
        @media print {
          body > *:not(.ws-print) { display: none !important; }
          .no-print { display: none !important; }
          .ws-print { max-width: none; padding: 0; color: #000 !important; background: #fff !important; }
          .ws-print * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
          .ws-q { break-inside: avoid; page-break-inside: avoid; }
          .ws-h { break-after: avoid; page-break-after: avoid; }
          @page { size: A4; margin: 2cm; }
        }
      `}</style>
      <PrintOnLoad />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-xs">
        <span className="font-bold text-[color:var(--primary)]">
          {answers ? `🖨️ הגשה של ${studentName}` : "🖨️ דף עבודה להדפסה"}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-full border border-[color:var(--border)] p-0.5 font-bold">
            <Link
              href={toggleHref(true)}
              aria-current={withVerses ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${withVerses ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--primary)]/70"}`}
            >
              עם פסוקים
            </Link>
            <Link
              href={toggleHref(false)}
              aria-current={!withVerses ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${!withVerses ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--primary)]/70"}`}
            >
              בלי פסוקים
            </Link>
          </span>
          <PrintButton />
        </span>
      </div>

      <div className="border-b-2 border-black pb-3">
        <p className="text-xs">תיכון שחרית · בית מדרש תורה שבכתב</p>
        {positionLabel(ref) && <p className="mt-1 text-xs font-bold">{positionLabel(ref)}</p>}
        <h1 className="mt-1 text-2xl font-extrabold">{content.title}</h1>
        {content.subtitle && <p className="text-sm">{content.subtitle}</p>}
        <p className="mt-1 text-sm">{content.bookRef}</p>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>שם: {studentName ?? "______________________"}</span>
          <span>כיתה: {studentClass ?? (answers ? "—" : "________")}</span>
          <span>תאריך: {submittedAt ? formatHebDate(submittedAt) : "____________"}</span>
        </div>
      </div>

      {content.sections.map((section) => (
        <section key={section.key} className="mt-6">
          <h2 className="ws-h text-lg font-extrabold">{section.title}</h2>
          <div className="mt-2 space-y-5">
            {section.blocks.map((b) => {
              if (b.type === "intro" || b.type === "case") {
                return (
                  <div key={b.key} className="ws-q text-[15px] leading-7">
                    {b.title && <p className="font-bold">{b.title}</p>}
                    <p className="whitespace-pre-wrap">{b.body}</p>
                  </div>
                );
              }
              if (b.type === "source") {
                return (
                  <div key={b.key} className="ws-q rounded border border-black/60 px-3 py-2 text-[15px] leading-7">
                    <p className="font-bold">{b.title}</p>
                    <p className="whitespace-pre-wrap">{b.text}</p>
                  </div>
                );
              }
              if (b.type !== "question") return null; // passage, art — not printed
              const q: QuestionBlock = b;
              n += 1;
              const box: VerseBox | null = withVerses
                ? isNoVerses(q.verses)
                  ? null
                  : (pinnedBox(reg.mainPassage, q.verses) ??
                    (auto[q.key] ? { ref: auto[q.key].ref, verses: auto[q.key].verses } : null) ??
                    (q.helpVerses ? { ref: q.helpVerses.ref, verses: q.helpVerses.verses } : null))
                : null;
              return (
                <div key={q.key} className="ws-q text-[15px] leading-7">
                  <div className="flex gap-2">
                    <span className="font-extrabold">{n}.</span>
                    <div className="flex-1">
                      <p className="whitespace-pre-wrap font-medium">{q.prompt}</p>
                      {q.helper && <p className="text-sm">{q.helper}</p>}
                      {withVerses && !box && q.versesNote && <p className="text-sm">📖 {q.versesNote}</p>}
                      {box && <VerseFrame box={box} />}
                      {q.fields ? (
                        q.fields.map((f) => {
                          const fbox = withVerses ? pinnedBox(reg.mainPassage, f.verses) : null;
                          return (
                            <div key={f.key}>
                              {fbox && <VerseFrame box={fbox} />}
                              {answerBox(f.label, `${q.key}:${f.key}`, q.minWords ? LINES_LONG : LINES_FIELD)}
                            </div>
                          );
                        })
                      ) : (
                        answerBox(null, q.key, LINES_LONG)
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function VerseFrame({ box }: { box: VerseBox }) {
  return (
    <div className="font-mikra my-2 rounded border border-black px-3 py-2 text-[18px] leading-9">
      <p className="mb-1 font-sans text-xs font-bold">📖 {box.ref}</p>
      <p>
        {box.verses.map((v, i) => (
          <span key={`${v.num}-${i}`}>
            <span className="me-1 font-sans text-xs font-bold">{v.num}</span>
            {v.text}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}
