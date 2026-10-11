"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SaveButton from "@/components/save-button";
import type { PrepDoc, PrepRow } from "@/lib/exam-prep";

// Under the exam editor: the preparation for students. Claude drafts it from
// the exam; the teacher edits, then publishes (only then do students see it
// on /exams). Regenerating replaces the draft and unpublishes.
export default function ExamPrepEditor({ examId, initial }: { examId: number; initial: PrepRow | null }) {
  const router = useRouter();
  const [prep, setPrep] = useState<PrepRow | null>(initial);
  const [doc, setDoc] = useState<PrepDoc | null>(initial?.doc ?? null);
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft");
  const [saved, setSaved] = useState(JSON.stringify({ doc: initial?.doc ?? null, status: initial?.status ?? "draft" }));
  const [gen, setGen] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const dirty = JSON.stringify({ doc, status }) !== saved;

  const generate = async () => {
    setGen("working");
    setError(null);
    setSeconds(0);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    try {
      const r = await fetch(`/api/exams/${examId}/prep`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error ?? "הפקת ההכנה נכשלה");
      setPrep(d.prep);
      setDoc(d.prep.doc);
      setStatus(d.prep.status);
      setSaved(JSON.stringify({ doc: d.prep.doc, status: d.prep.status }));
      setGen("idle");
      router.refresh();
    } catch (e) {
      setGen("error");
      setError(e instanceof Error ? e.message : "הפקת ההכנה נכשלה");
    } finally {
      clearInterval(tick);
    }
  };

  const save = async () => {
    if (!doc) return;
    const r = await fetch(`/api/exams/${examId}/prep`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc, status }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error ?? "השמירה נכשלה");
    setPrep(d.prep);
    setDoc(d.prep.doc);
    setStatus(d.prep.status);
    setSaved(JSON.stringify({ doc: d.prep.doc, status: d.prep.status }));
    router.refresh();
  };

  const field = "w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[color:var(--accent)]";

  return (
    <section className="mx-auto mt-10 max-w-4xl rounded-3xl border-2 border-dashed border-[color:var(--primary)]/40 bg-[color:var(--card)] p-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-[color:var(--primary)]">📚 הכנה למבחן — לתלמידים</h2>
          <p className="text-xs text-[color:var(--primary)]/60">
            נושאים לחזרה, עצות לכל חלק, ושאלות תרגול מקבילות למבחן (לא זהות) עם תשובות לבדיקה עצמית. מופיע בעמוד ״הכנות למבחנים״ רק אחרי שתפרסמי.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={gen === "working"}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-extrabold text-white shadow transition ${gen === "working" ? "cursor-wait opacity-90" : "hover:scale-[1.03]"}`}
          style={{ background: "linear-gradient(135deg, var(--accent), var(--primary))" }}
        >
          {gen === "working" ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              קלוד כותב את ההכנה… {seconds} שנ׳
            </>
          ) : doc ? (
            "🔁 הכנה חדשה מקלוד (מחליפה את הנוכחית)"
          ) : (
            "✨ הפקת הכנה למבחן"
          )}
        </button>
      </div>
      {gen === "error" && error && <p className="mt-2 text-xs font-bold text-[color:var(--danger)]">{error}</p>}

      {doc && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[color:var(--background)] px-4 py-2">
            <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--primary)]">
              <input type="checkbox" checked={status === "published"} onChange={(e) => setStatus(e.target.checked ? "published" : "draft")} />
              {status === "published" ? "מפורסם לתלמידים" : "פרסום לתלמידים"}
            </label>
            <div className="flex items-center gap-3">
              {prep?.status === "published" && (
                <a href="/exams" target="_blank" className="text-xs font-bold text-[color:var(--primary)]/70 hover:text-[color:var(--accent)]">
                  ↗ כפי שהתלמידים רואים
                </a>
              )}
              <SaveButton dirty={dirty} onSave={save} label={status === "published" ? "שמירה ופרסום" : "שמירת השינויים"} />
            </div>
          </div>

          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            כותרת
            <input className={`${field} mt-1 font-display font-extrabold`} value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
          </label>
          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            פתיח לתלמידים
            <textarea className={`${field} mt-1`} rows={4} value={doc.intro} onChange={(e) => setDoc({ ...doc, intro: e.target.value })} />
          </label>

          <div>
            <p className="mb-1 text-xs font-bold text-[color:var(--primary)]/70">מה צריך לדעת (שורה לכל נקודה)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {doc.topics.map((t, ti) => (
                <div key={ti} className="rounded-xl border border-[color:var(--border)] p-3">
                  <input className={`${field} font-bold`} value={t.unit} onChange={(e) => setDoc({ ...doc, topics: doc.topics.map((x, i) => (i === ti ? { ...x, unit: e.target.value } : x)) })} />
                  <textarea
                    className={`${field} mt-2`}
                    rows={5}
                    value={t.points.join("\n")}
                    onChange={(e) => setDoc({ ...doc, topics: doc.topics.map((x, i) => (i === ti ? { ...x, points: e.target.value.split("\n") } : x)) })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-bold text-[color:var(--primary)]/70">עצות לכל חלק</p>
            <div className="space-y-2">
              {doc.tips.map((t, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr]">
                  <input className={field} value={t.part} onChange={(e) => setDoc({ ...doc, tips: doc.tips.map((x, j) => (j === i ? { ...x, part: e.target.value } : x)) })} />
                  <textarea className={field} rows={2} value={t.tip} onChange={(e) => setDoc({ ...doc, tips: doc.tips.map((x, j) => (j === i ? { ...x, tip: e.target.value } : x)) })} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-bold text-[color:var(--primary)]/70">שאלות תרגול ({doc.practice.length})</p>
            <ol className="space-y-3">
              {doc.practice.map((q, i) => (
                <li key={q.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[color:var(--accent)]">
                      {i + 1} · {q.kind}
                      {q.verseNum ? ` · פסוק ${q.verseNum}` : ""}
                    </span>
                    <button type="button" onClick={() => setDoc({ ...doc, practice: doc.practice.filter((x) => x.id !== q.id) })} className="text-xs font-bold text-[color:var(--danger)]/70 hover:text-[color:var(--danger)]">
                      🗑 מחיקה
                    </button>
                  </div>
                  {q.verse && <p className="my-1 rounded-lg bg-white px-3 py-1.5 text-[15px] leading-7">{q.verse}</p>}
                  <textarea className={`${field} mt-1`} rows={2} value={q.text} onChange={(e) => setDoc({ ...doc, practice: doc.practice.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)) })} />
                  <textarea className={`${field} mt-1 bg-[color:var(--success)]/5`} rows={2} value={q.answer} onChange={(e) => setDoc({ ...doc, practice: doc.practice.map((x) => (x.id === q.id ? { ...x, answer: e.target.value } : x)) })} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
