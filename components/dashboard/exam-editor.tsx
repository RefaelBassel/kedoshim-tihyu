"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SaveButton from "@/components/save-button";
import type { ExamDoc, ExamQuestion, ExamRow, ExamSection } from "@/lib/exams";

// The exam editor: every field is hers to change; a question can be swapped
// for a new one from Claude (with an optional instruction); nothing leaves
// the page until she presses save. Print opens the student or the teacher
// version in a new tab.
export default function ExamEditor({ exam }: { exam: ExamRow }) {
  const router = useRouter();
  const [doc, setDoc] = useState<ExamDoc>(exam.doc);
  const [status, setStatus] = useState<"draft" | "ready">(exam.status);
  const [saved, setSaved] = useState(JSON.stringify({ doc: exam.doc, status: exam.status }));
  const [busyQ, setBusyQ] = useState<string | null>(null);
  const [qError, setQError] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<"idle" | "confirm" | "working">("idle");

  const dirty = JSON.stringify({ doc, status }) !== saved;
  const total = useMemo(
    () => doc.sections.reduce((a, s) => a + s.questions.reduce((b, q) => b + (Number(q.points) || 0), 0), 0),
    [doc]
  );

  const save = async () => {
    const r = await fetch(`/api/exams/${exam.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc, status }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error ?? "השמירה נכשלה");
    setDoc(d.exam.doc);
    setStatus(d.exam.status);
    setSaved(JSON.stringify({ doc: d.exam.doc, status: d.exam.status }));
    router.refresh();
  };

  const patchSection = (key: string, fn: (s: ExamSection) => ExamSection) =>
    setDoc((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? fn(s) : s)) }));
  const patchQuestion = (key: string, id: string, fn: (q: ExamQuestion) => ExamQuestion) =>
    patchSection(key, (s) => ({ ...s, questions: s.questions.map((q) => (q.id === id ? fn(q) : q)) }));

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
  const removeQuestion = (key: string, id: string) =>
    patchSection(key, (s) => ({ ...s, questions: s.questions.filter((q) => q.id !== id) }));

  const destroy = async () => {
    setDeleting("working");
    await fetch(`/api/exams/${exam.id}`, { method: "DELETE" });
    router.push("/dashboard/exams");
    router.refresh();
  };

  const field = "w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[color:var(--accent)]";

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
      {/* top bar: status, totals, print, save */}
      <div className="sticky top-[57px] z-20 -mx-2 rounded-b-xl border-x border-b border-[color:var(--border)] px-4 py-2" style={{ backgroundColor: "var(--card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`font-extrabold ${total === 100 ? "text-[color:var(--success)]" : "text-[color:var(--warning)]"}`}>
              סה״כ {total} נק׳{total !== 100 && " (לא 100)"}
            </span>
            <label className="flex items-center gap-2 text-xs font-bold text-[color:var(--primary)]/70">
              <input type="checkbox" checked={status === "ready"} onChange={(e) => setStatus(e.target.checked ? "ready" : "draft")} />
              מוכן להדפסה
            </label>
            <Link href={`/dashboard/exams/${exam.id}/print?v=student`} target="_blank" className="rounded-full border border-[color:var(--primary)]/40 px-3 py-1 text-xs font-bold text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10">
              🖨 גרסת תלמיד
            </Link>
            <Link href={`/dashboard/exams/${exam.id}/print?v=teacher`} target="_blank" className="rounded-full border border-[color:var(--primary)]/40 px-3 py-1 text-xs font-bold text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10">
              🖨 גרסת מורה (עם תשובות)
            </Link>
            <span className="flex items-center gap-1 text-xs font-bold text-[color:var(--primary)]/70">
              ⬇ הורדה:
              {(["student", "teacher"] as const).map((v) =>
                (["docx", "pdf"] as const).map((f) => (
                  <a
                    key={`${v}-${f}`}
                    href={`/api/exams/${exam.id}/export?format=${f}&v=${v}`}
                    className="rounded-full bg-[color:var(--primary)]/10 px-2.5 py-1 text-[11px] font-extrabold text-[color:var(--primary)] hover:bg-[color:var(--primary)]/20"
                    title={`${v === "teacher" ? "גרסת מורה" : "גרסת תלמיד"} — ${f === "pdf" ? "PDF" : "Word"}`}
                  >
                    {v === "teacher" ? "מורה" : "תלמיד"} · {f === "pdf" ? "PDF" : "Word"}
                  </a>
                ))
              )}
            </span>
          </div>
          <SaveButton dirty={dirty} onSave={save} />
        </div>
        {dirty && <p className="mt-1 text-[11px] font-bold text-[color:var(--warning)]">יש שינויים שלא נשמרו — ההדפסה מציגה את הגרסה השמורה.</p>}
      </div>

      {/* head */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <label className="block text-xs font-bold text-[color:var(--primary)]/70">
          כותרת
          <input className={`${field} mt-1 font-display text-base font-extrabold`} value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
        </label>
        <label className="mt-3 block text-xs font-bold text-[color:var(--primary)]/70">
          כותרת משנה
          <input className={`${field} mt-1`} value={doc.subtitle} onChange={(e) => setDoc({ ...doc, subtitle: e.target.value })} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            הוראות לתלמיד
            <textarea className={`${field} mt-1`} rows={3} value={doc.instructions} onChange={(e) => setDoc({ ...doc, instructions: e.target.value })} />
          </label>
          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            משך (דקות)
            <input type="number" className={`${field} mt-1`} value={doc.durationMin} onChange={(e) => setDoc({ ...doc, durationMin: Number(e.target.value) || 0 })} />
          </label>
        </div>
      </section>

      {/* sections */}
      {doc.sections.map((s, si) => {
        const secPoints = s.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
        return (
          <section key={s.key} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-wide text-[color:var(--accent)]">חלק {si + 1} · {secPoints} נק׳</span>
              <button type="button" onClick={() => addQuestion(s.key)} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)] hover:border-[color:var(--accent)]">
                ＋ שאלה
              </button>
            </div>
            <input className={`${field} mt-2 font-display text-base font-extrabold`} value={s.title} onChange={(e) => patchSection(s.key, (x) => ({ ...x, title: e.target.value }))} />
            <textarea className={`${field} mt-2`} rows={2} value={s.intro} onChange={(e) => patchSection(s.key, (x) => ({ ...x, intro: e.target.value }))} placeholder="הוראה קצרה לחלק" />

            <ol className="mt-4 space-y-4">
              {s.questions.map((q, qi) => (
                <li key={q.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="mt-2 w-6 text-center text-sm font-extrabold text-[color:var(--primary)]/60">{qi + 1}.</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      {q.verse && (
                        <p className="rounded-lg bg-white px-3 py-2 text-[17px] leading-8 text-[color:var(--foreground)]" style={{ fontFamily: "var(--font-heebo)" }}>
                          <span className="me-1 text-xs font-bold text-[color:var(--accent)]">({q.verseNum})</span>
                          {q.verse}
                        </p>
                      )}
                      <textarea className={field} rows={2} value={q.text} onChange={(e) => patchQuestion(s.key, q.id, (x) => ({ ...x, text: e.target.value }))} placeholder="נוסח השאלה לתלמיד" />
                      <textarea className={`${field} bg-[color:var(--success)]/5`} rows={2} value={q.answer} onChange={(e) => patchQuestion(s.key, q.id, (x) => ({ ...x, answer: e.target.value }))} placeholder="תשובה צפויה / מחוון — למורה בלבד" />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-xs font-bold text-[color:var(--primary)]/70">
                          נק׳
                          <input type="number" className="w-16 rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-sm" value={q.points} onChange={(e) => patchQuestion(s.key, q.id, (x) => ({ ...x, points: Number(e.target.value) || 0 }))} />
                        </label>
                        <input className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-xs" placeholder="בקשה לשאלה חלופית (לא חובה): למשל ״על השעיר לעזאזל״" value={ask[q.id] ?? ""} onChange={(e) => setAsk((a) => ({ ...a, [q.id]: e.target.value }))} />
                        <button
                          type="button"
                          disabled={busyQ != null}
                          onClick={() => swap(s.key, q)}
                          className={`rounded-full px-3 py-1 text-xs font-bold text-white transition ${busyQ === q.id ? "cursor-wait opacity-80" : "hover:scale-[1.03]"}`}
                          style={{ background: "linear-gradient(135deg, var(--accent), var(--primary))" }}
                        >
                          {busyQ === q.id ? "קלוד מחבר…" : "🔁 שאלה חלופית"}
                        </button>
                        <button type="button" onClick={() => removeQuestion(s.key, q.id)} className="rounded-full px-2 py-1 text-xs font-bold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10">
                          🗑 מחיקה
                        </button>
                      </div>
                      {qError[q.id] && <p className="text-xs font-bold text-[color:var(--danger)]">{qError[q.id]}</p>}
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
            <button type="button" onClick={destroy} disabled={deleting === "working"} className="rounded-full bg-[color:var(--danger)] px-3 py-1 text-white">
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
