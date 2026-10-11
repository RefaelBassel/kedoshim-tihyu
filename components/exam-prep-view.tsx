"use client";

import { useEffect, useState } from "react";
import type { PrepDoc, PrepQuestion } from "@/lib/exam-prep";
import { etnachtaSplit } from "@/lib/etnachta";

// The student's preparation page: topics to tick off (kept in this browser
// only), a tip per exam part, and practice questions with answers to reveal.
// Nothing here is the exam itself.

const KIND_LABEL: Record<PrepQuestion["kind"], string> = {
  pshat: "בקיאות בפשט",
  etnachta: "זיהוי אתנחתא",
  quotes: "זיהוי פסוקים",
  study: "שאלת עיון",
  argument: "שאלת טיעון",
};

export default function ExamPrepView({ prepId, doc }: { prepId: number; doc: PrepDoc }) {
  const storageKey = `prep-${prepId}-done`;
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* private mode etc. */
    }
  }, [storageKey]);
  const toggle = (k: string) => {
    setDone((d) => {
      const next = { ...d, [k]: !d[k] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const total = doc.topics.reduce((a, t) => a + t.points.length, 0);
  const ticked = doc.topics.reduce((a, t, ti) => a + t.points.filter((_, pi) => done[`${ti}-${pi}`]).length, 0);
  const pct = total ? Math.round((100 * ticked) / total) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      <section className="rounded-3xl border-2 border-[color:var(--accent)]/50 bg-[color:var(--card)] p-5 sm:p-7">
        <h2 className="font-display text-2xl font-extrabold text-[color:var(--primary)]">{doc.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-[color:var(--foreground)]/85">{doc.intro}</p>
      </section>

      {/* topics checklist */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-extrabold text-[color:var(--primary)]">📚 מה צריך לדעת</h3>
          <span className="text-xs font-bold text-[color:var(--primary)]/60">סימנתי {ticked} מתוך {total}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--background)]">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--success)" : "var(--primary)" }} />
        </div>
        <div className="mt-4 space-y-4">
          {doc.topics.map((t, ti) => (
            <div key={ti}>
              <p className="mb-1 text-sm font-extrabold text-[color:var(--accent)]">{t.unit}</p>
              <ul className="space-y-1">
                {t.points.map((p, pi) => {
                  const k = `${ti}-${pi}`;
                  return (
                    <li key={k}>
                      <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-sm leading-6 transition ${done[k] ? "bg-[color:var(--success)]/10 text-[color:var(--foreground)]/60 line-through" : "hover:bg-[color:var(--background)]"}`}>
                        <input type="checkbox" className="mt-1.5" checked={Boolean(done[k])} onChange={() => toggle(k)} />
                        <span>{p}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* tips */}
      {doc.tips.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
          <h3 className="font-display text-lg font-extrabold text-[color:var(--primary)]">🧭 איך מתכוננים לכל חלק</h3>
          <ul className="mt-3 space-y-2">
            {doc.tips.map((t, i) => (
              <li key={i} className="rounded-xl bg-[color:var(--background)] px-3 py-2 text-sm leading-6">
                <span className="font-extrabold text-[color:var(--accent)]">{t.part}: </span>
                {t.tip}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* practice */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <h3 className="font-display text-lg font-extrabold text-[color:var(--primary)]">✍️ תרגול — קודם עונים, אחר כך בודקים</h3>
        <p className="mt-1 text-xs text-[color:var(--primary)]/60">כתבו את התשובה במחברת לפני שאתם פותחים את התשובה. השאלות דומות למבחן, לא זהות לו.</p>
        <ol className="mt-4 space-y-4">
          {doc.practice.map((q, i) => {
            const split = q.verse ? etnachtaSplit(q.verse) : null;
            return (
              <li key={q.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
                <p className="text-[11px] font-bold text-[color:var(--accent)]">{KIND_LABEL[q.kind]}</p>
                {q.verse && (
                  <p className="my-2 rounded-lg bg-white px-3 py-2 text-[17px] leading-8">
                    <span className="me-1 text-xs font-bold text-[color:var(--accent)]">({q.verseNum})</span>
                    {q.verse}
                  </p>
                )}
                <p className="text-[15px] font-medium leading-7">
                  {i + 1}. {q.text}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [q.id]: !o[q.id] }))}
                  className="mt-2 rounded-full border border-[color:var(--primary)]/40 px-3 py-1 text-xs font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10"
                >
                  {open[q.id] ? "להסתיר את התשובה" : "הצגת התשובה"}
                </button>
                {open[q.id] && (
                  <div className="mt-2 rounded-lg bg-[color:var(--success)]/10 px-3 py-2 text-sm leading-6">
                    {split && q.kind === "etnachta" ? (
                      <p className="mb-1">
                        האתנחתא במילה <b>״{split.word}״</b>. חלק א: {split.first} · חלק ב: {split.second}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap">{q.answer.replace(/^האתנחתא במילה[^\n]*\n?/, "")}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
