"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AutosaveStatus, useAutosave } from "@/components/autosave";
import { linesForQuestion, questionNumbers } from "@/lib/exam-export-shared";
import type { ExamDoc, ExamQuestion, ExamRow, ExamSection } from "@/lib/exams";

// The exam editor: every field is hers to change — wording, points, answer
// lines, order, adding and deleting — and every change saves itself. The
// answer key sits beside each question, marked teacher-only. A question can
// be swapped for a new one from Claude. Print opens the clean student
// version or the answer key in a new tab. Students never reach this page.

const STATUS_TEXT = { draft: "טיוטה — מוסתר מהתלמידים", ready: "המחוון אושר — מוסתר מהתלמידים" } as const;

export default function ExamEditor({ exam }: { exam: ExamRow }) {
  const router = useRouter();
  const [doc, setDoc] = useState<ExamDoc>(exam.doc);
  const [status, setStatus] = useState<"draft" | "ready">(exam.status);
  const [busyQ, setBusyQ] = useState<string | null>(null);
  const [qError, setQError] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<"idle" | "confirm" | "working">("idle");

  const value = useMemo(() => ({ doc, status }), [doc, status]);
  const save = useCallback(
    async (v: { doc: ExamDoc; status: "draft" | "ready" }) => {
      const r = await fetch(`/api/exams/${exam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error ?? "השמירה נכשלה");
    },
    [exam.id]
  );
  const autosave = useAutosave(value, save);

  const total = useMemo(
    () => doc.sections.reduce((a, s) => a + s.questions.reduce((b, q) => b + (Number(q.points) || 0), 0), 0),
    [doc]
  );
  const nums = useMemo(() => questionNumbers(doc), [doc]);

  const patchSection = (key: string, fn: (s: ExamSection) => ExamSection) =>
    setDoc((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? fn(s) : s)) }));
  const patchQuestion = (key: string, id: string, fn: (q: ExamQuestion) => ExamQuestion) =>
    patchSection(key, (s) => ({ ...s, questions: s.questions.map((q) => (q.id === id ? fn(q) : q)) }));

  // one step up or down; past the edge of a part it moves into the next part
  const move = (si: number, qi: number, dir: -1 | 1) =>
    setDoc((d) => {
      const sections = d.sections.map((s) => ({ ...s, questions: [...s.questions] }));
      const from = sections[si];
      const [q] = from.questions.splice(qi, 1);
      const to = qi + dir;
      if (to >= 0 && to <= from.questions.length) from.questions.splice(to, 0, q);
      else if (dir < 0 && si > 0) sections[si - 1].questions.push(q);
      else if (dir > 0 && si < sections.length - 1) sections[si + 1].questions.unshift(q);
      else from.questions.splice(qi, 0, q);
      return { ...d, sections };
    });

  const swap = async (sectionKey: string, q: ExamQuestion) => {
    setBusyQ(q.id);
    setQError((e) => ({ ...e, [q.id]: "" }));
    try {
      const r = await fetch(`/api/exams/${exam.id}/question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey, questionId: q.id, instruction: ask[q.id] ?? "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error ?? "לא הצליח");
      patchQuestion(sectionKey, q.id, () => d.question as ExamQuestion);
      setAsk((a) => ({ ...a, [q.id]: "" }));
    } catch (e) {
      setQError((er) => ({ ...er, [q.id]: e instanceof Error ? e.message : "לא הצליח" }));
    } finally {
      setBusyQ(null);
    }
  };

  const addQuestion = (key: string) =>
    patchSection(key, (s) => ({
      ...s,
      questions: [...s.questions, { id: `n${Date.now().toString(36)}`, text: "", points: 0, answer: "" }],
    }));
  const removeQuestion = (key: string, id: string) => {
    patchSection(key, (s) => ({ ...s, questions: s.questions.filter((q) => q.id !== id) }));
    setConfirmDel(null);
  };

  const destroy = async () => {
    setDeleting("working");
    await fetch(`/api/exams/${exam.id}`, { method: "DELETE" });
    router.push("/dashboard/exams");
    router.refresh();
  };

  const field = "w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[color:var(--accent)]";
  const small = "rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-sm";
  const printLink = "rounded-full px-3 py-1 text-xs font-extrabold transition hover:scale-[1.03]";

  return (
    <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
      {/* top bar: status, totals, autosave, print */}
      <div className="sticky top-[57px] z-20 -mx-2 rounded-b-xl border-x border-b border-[color:var(--border)] px-4 py-2 shadow-sm" style={{ backgroundColor: "var(--card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                status === "ready" ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" : "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"
              }`}
            >
              🔒 {STATUS_TEXT[status]}
            </span>
            <span className={`font-extrabold ${total === 100 ? "text-[color:var(--success)]" : "text-[color:var(--warning)]"}`}>
              סה״כ {total} נק׳{total !== 100 && " (לא 100)"}
            </span>
            <span className="text-xs font-bold text-[color:var(--primary)]/60">⏱ {doc.durationMin} דק׳</span>
            <AutosaveStatus state={autosave.state} error={autosave.error} onRetry={autosave.flush} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/exams/${exam.id}/print?v=student`} target="_blank" className={`${printLink} bg-[color:var(--primary)] text-white`}>
              🖨 הדפסה / PDF — גרסת תלמיד
            </Link>
            <Link href={`/dashboard/exams/${exam.id}/print?v=teacher`} target="_blank" className={`${printLink} border border-[color:var(--primary)]/40 text-[color:var(--primary)]`}>
              🖨 הדפסת המחוון
            </Link>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-bold text-[color:var(--primary)]/60">
          ⬇ הורדה:
          {(["student", "teacher"] as const).map((v) =>
            (["docx", "pdf"] as const).map((f) => (
              <a
                key={`${v}-${f}`}
                href={`/api/exams/${exam.id}/export?format=${f}&v=${v}`}
                className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[color:var(--primary)] hover:bg-[color:var(--primary)]/20"
              >
                {v === "teacher" ? "מחוון" : "תלמיד"} · {f === "pdf" ? "PDF" : "Word"}
              </a>
            ))
          )}
          {autosave.state !== "saved" && <span className="ms-2 text-[color:var(--warning)]">ההדפסה מציגה את הגרסה השמורה — רגע עד שהשמירה תסתיים.</span>}
        </div>
      </div>

      {/* head */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <label className="block text-xs font-bold text-[color:var(--primary)]/70">
          כותרת
          <input className={`${field} mt-1 font-display text-base font-extrabold`} value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
        </label>
        <label className="mt-3 block text-xs font-bold text-[color:var(--primary)]/70">
          כותרת משנה (לא חובה)
          <input className={`${field} mt-1`} value={doc.subtitle} onChange={(e) => setDoc({ ...doc, subtitle: e.target.value })} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_170px]">
          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            הנחיה בראש המבחן
            <textarea className={`${field} mt-1`} rows={2} value={doc.instructions} onChange={(e) => setDoc({ ...doc, instructions: e.target.value })} />
          </label>
          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            משך (דקות)
            <input type="number" min={10} className={`${field} mt-1`} value={doc.durationMin} onChange={(e) => setDoc({ ...doc, durationMin: Number(e.target.value) || 0 })} />
          </label>
          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            תאריך המבחן
            <input type="date" className={`${field} mt-1`} value={doc.examDate ?? ""} onChange={(e) => setDoc({ ...doc, examDate: e.target.value })} />
          </label>
        </div>
        <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 rounded-full border border-[color:var(--border)] px-4 py-1.5 text-sm font-bold text-[color:var(--primary)] transition hover:border-[color:var(--success)]">
          <input type="checkbox" checked={status === "ready"} onChange={(e) => setStatus(e.target.checked ? "ready" : "draft")} />
          בדקתי את המבחן ואת המחוון — מאושר
        </label>
      </section>

      {/* sections */}
      {doc.sections.map((s, si) => {
        const secPoints = s.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
        return (
          <section key={s.key} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-wide text-[color:var(--accent)]">
                חלק {si + 1} · {s.questions.length} שאלות · {secPoints} נק׳
              </span>
              <button type="button" onClick={() => addQuestion(s.key)} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)] transition hover:border-[color:var(--accent)] active:scale-95">
                ＋ שאלה בחלק הזה
              </button>
            </div>
            <input className={`${field} mt-2 font-display text-base font-extrabold`} value={s.title} onChange={(e) => patchSection(s.key, (x) => ({ ...x, title: e.target.value }))} />
            <textarea className={`${field} mt-2`} rows={1} value={s.intro} onChange={(e) => patchSection(s.key, (x) => ({ ...x, intro: e.target.value }))} placeholder="הוראה קצרה לחלק (לא חובה)" />

            <ol className="mt-4 space-y-4">
              {s.questions.map((q, qi) => (
                <li key={q.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3">
                  <div className="grid gap-3 lg:grid-cols-[1fr_minmax(0,0.85fr)]">
                    {/* the question, as students will read it */}
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-extrabold text-[color:var(--primary)]">{nums.get(q.id)}.</span>
                        <label className="flex items-center gap-1 text-xs font-bold text-[color:var(--primary)]/70">
                          נק׳
                          <input type="number" min={0} className={`${small} w-16`} value={q.points} onChange={(e) => patchQuestion(s.key, q.id, (x) => ({ ...x, points: Number(e.target.value) || 0 }))} />
                        </label>
                        <label className="flex items-center gap-1 text-xs font-bold text-[color:var(--primary)]/70" title="שורות לכתיבה בגרסת התלמיד">
                          שורות
                          <input type="number" min={0} max={30} className={`${small} w-14`} value={linesForQuestion(s.key, q)} onChange={(e) => patchQuestion(s.key, q.id, (x) => ({ ...x, lines: Math.max(0, Number(e.target.value) || 0) }))} />
                        </label>
                        <span className="ms-auto flex items-center gap-1">
                          <button type="button" aria-label="למעלה" title="הזזה למעלה" disabled={si === 0 && qi === 0} onClick={() => move(si, qi, -1)} className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs font-bold text-[color:var(--primary)] transition hover:border-[color:var(--accent)] active:scale-90 disabled:opacity-30">
                            ↑
                          </button>
                          <button type="button" aria-label="למטה" title="הזזה למטה" disabled={si === doc.sections.length - 1 && qi === s.questions.length - 1} onClick={() => move(si, qi, 1)} className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs font-bold text-[color:var(--primary)] transition hover:border-[color:var(--accent)] active:scale-90 disabled:opacity-30">
                            ↓
                          </button>
                          {confirmDel === q.id ? (
                            <>
                              <button type="button" onClick={() => removeQuestion(s.key, q.id)} className="rounded-full bg-[color:var(--danger)] px-2.5 py-0.5 text-xs font-bold text-white active:scale-95">
                                כן, למחוק
                              </button>
                              <button type="button" onClick={() => setConfirmDel(null)} className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs font-bold">
                                ביטול
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => setConfirmDel(q.id)} className="rounded-full px-2 py-0.5 text-xs font-bold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10">
                              🗑 מחיקה
                            </button>
                          )}
                        </span>
                      </div>
                      {q.verse && (
                        <p className="font-mikra rounded-lg bg-white px-3 py-2 text-[18px] leading-9 text-[color:var(--foreground)]">
                          <span className="me-1 text-xs font-bold text-[color:var(--accent)]">({q.verseNum})</span>
                          {q.verse}
                        </p>
                      )}
                      <textarea className={field} rows={Math.min(8, Math.max(2, Math.ceil(q.text.length / 70) + q.text.split("\n").length - 1))} value={q.text} onChange={(e) => patchQuestion(s.key, q.id, (x) => ({ ...x, text: e.target.value }))} placeholder="נוסח השאלה לתלמיד" />
                      <details className="text-xs">
                        <summary className="cursor-pointer font-bold text-[color:var(--primary)]/60 hover:text-[color:var(--accent)]">🔁 שאלה חלופית מקלוד</summary>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-xs" placeholder="בקשה (לא חובה): למשל ״על השעיר לעזאזל״" value={ask[q.id] ?? ""} onChange={(e) => setAsk((a) => ({ ...a, [q.id]: e.target.value }))} />
                          <button
                            type="button"
                            disabled={busyQ != null}
                            onClick={() => swap(s.key, q)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white transition ${busyQ === q.id ? "cursor-wait opacity-80" : "hover:scale-[1.03] active:scale-95"}`}
                            style={{ background: "linear-gradient(135deg, var(--accent), var(--primary))" }}
                          >
                            {busyQ === q.id && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                            {busyQ === q.id ? "קלוד מחבר…" : "החלפת השאלה"}
                          </button>
                        </div>
                        {qError[q.id] && <p className="mt-1 font-bold text-[color:var(--danger)]">{qError[q.id]}</p>}
                      </details>
                    </div>
                    {/* the answer key beside it — teacher only */}
                    <div className="min-w-0 rounded-xl border border-dashed border-[color:var(--success)]/50 bg-[color:var(--success)]/5 p-2">
                      <p className="mb-1 flex items-center justify-between text-[11px] font-extrabold text-[color:var(--success)]">
                        <span>🔑 מחוון — למורה בלבד</span>
                        {status === "draft" && <span className="font-bold text-[color:var(--warning)]">טיוטה לבדיקה</span>}
                      </p>
                      <textarea className={`${field} bg-white/80`} rows={Math.min(8, Math.max(2, Math.ceil(q.answer.length / 60)))} value={q.answer} onChange={(e) => patchQuestion(s.key, q.id, (x) => ({ ...x, answer: e.target.value }))} placeholder="תשובה צפויה / מחוון" />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      <div className="flex items-center justify-between">
        <Link href="/dashboard/exams" className="text-xs font-bold text-[color:var(--primary)]/60 hover:text-[color:var(--accent)]">
          → כל המבחנים
        </Link>
        {deleting === "idle" ? (
          <button type="button" onClick={() => setDeleting("confirm")} className="text-xs font-bold text-[color:var(--danger)]/70 hover:text-[color:var(--danger)]">
            מחיקת המבחן
          </button>
        ) : (
          <span className="flex items-center gap-2 text-xs font-bold">
            למחוק את המבחן לצמיתות?
            <button type="button" onClick={destroy} disabled={deleting === "working"} className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--danger)] px-3 py-1 text-white">
              {deleting === "working" && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {deleting === "working" ? "מוחק…" : "כן, למחוק"}
            </button>
            <button type="button" onClick={() => setDeleting("idle")} className="rounded-full border border-[color:var(--border)] px-3 py-1">
              ביטול
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
