"use client";

import { useState } from "react";
import type { PrepProgress, StudentPrep, StudentPrepItem } from "@/lib/exam-prep";
import { countdownText, readyWord } from "@/lib/prep-shared";

// The student's preparation page: the chapter map, the expressions to know,
// practice checked at once (try again as often as you like; the answer opens
// after a few tries), and an argument with short feedback from Claude. A
// progress bar on top; finishing everything earns the "ready" badge on /me.
// Nothing here is the exam itself, and no answer is in the page until it
// was earned.

export default function ExamPrepView({
  prep,
  progress: initialProgress,
  explains,
  daysLeft,
  revealAfter,
  addressForm,
}: {
  prep: StudentPrep;
  progress: PrepProgress;
  explains: Record<string, string>;
  daysLeft: number | null;
  revealAfter: number;
  addressForm: string | null;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const pct = progress.total ? Math.round((100 * progress.done) / progress.total) : 0;
  const countdown = countdownText(daysLeft);

  return (
    <div id={`prep-${prep.id}`} className="mx-auto max-w-3xl scroll-mt-24 space-y-6" dir="rtl">
      <section className="rounded-3xl border-2 border-[color:var(--accent)]/50 bg-[color:var(--card)] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-extrabold text-[color:var(--primary)]">{prep.title}</h2>
          {countdown && <span className="rounded-full bg-[color:var(--accent)] px-4 py-1 text-sm font-extrabold text-white shadow">⏳ {countdown}</span>}
        </div>
        {prep.intro && <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-[color:var(--foreground)]/85">{prep.intro}</p>}
        {/* personal progress */}
        <div className="mt-4 rounded-2xl bg-[color:var(--background)] p-3">
          <div className="flex items-center justify-between gap-3 text-sm font-bold text-[color:var(--primary)]">
            <span>
              השלמת {progress.done} מתוך {progress.total}
            </span>
            {progress.ready ? <span className="rounded-full bg-[color:var(--success)] px-3 py-0.5 text-xs text-white">🏅 {readyWord(addressForm)} למבחן!</span> : <span className="text-xs text-[color:var(--primary)]/60">{pct}%</span>}
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-[color:var(--border)]/60">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: progress.ready ? "var(--success)" : "linear-gradient(90deg, var(--accent), var(--primary))" }} />
          </div>
        </div>
      </section>

      {/* (1) the chapter map */}
      {prep.map.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
          <h3 className="font-display text-lg font-extrabold text-[color:var(--primary)]">🗺️ מפת הפרק</h3>
          <ol className="relative mt-4 space-y-3 border-s-2 border-[color:var(--accent)]/40 ps-5">
            {prep.map.map((m, i) => (
              <li key={i} className="relative">
                <span className="absolute -start-[1.85rem] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--accent)] text-[11px] font-extrabold text-white">{i + 1}</span>
                <p className="font-extrabold text-[color:var(--primary)]">
                  {m.title}
                  {m.verses && <span className="ms-2 rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-xs">{m.verses}</span>}
                </p>
                {m.summary && <p className="text-sm leading-6 text-[color:var(--foreground)]/80">{m.summary}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* (2) expressions */}
      {prep.terms.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
          <h3 className="font-display text-lg font-extrabold text-[color:var(--primary)]">🔤 ביטויים שחייבים להכיר</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {prep.terms.map((t, i) => (
              <li key={i} className="rounded-xl bg-[color:var(--background)] px-3 py-2">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-mikra text-lg font-bold text-[color:var(--primary)]">{t.term}</span>
                  {t.verses && <span className="whitespace-nowrap text-xs font-bold text-[color:var(--accent)]">פסוק {t.verses}</span>}
                </p>
                {t.note && <p className="text-xs leading-5 text-[color:var(--foreground)]/70">{t.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* (3) practice */}
      {prep.practice.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
          <h3 className="font-display text-lg font-extrabold text-[color:var(--primary)]">✍️ תרגול — בדיקה מיידית</h3>
          <p className="mt-1 text-xs text-[color:var(--primary)]/60">השאלות דומות לשאלות המבחן, לא זהות להן. טעות? אפשר לנסות שוב — עם התנ״ך ביד.</p>
          <ol className="mt-4 space-y-4">
            {prep.practice.map((q, i) => (
              <PracticeItem
                key={q.id}
                n={i + 1}
                prepId={prep.id}
                item={q}
                solved={progress.solved.includes(q.id)}
                initialExplain={explains[q.id] ?? ""}
                initialAttempts={progress.attempts[q.id] ?? 0}
                revealAfter={revealAfter}
                onProgress={setProgress}
              />
            ))}
          </ol>
        </section>
      )}

      {/* (4) argument */}
      {prep.argument.questions.length > 0 && <ArgumentPractice prep={prep} saved={progress.argument} onProgress={setProgress} />}
    </div>
  );
}

type Phase = "idle" | "checking" | "right" | "wrong" | "error";

function PracticeItem({
  n,
  prepId,
  item,
  solved,
  initialExplain,
  initialAttempts,
  revealAfter,
  onProgress,
}: {
  n: number;
  prepId: number;
  item: StudentPrepItem;
  solved: boolean;
  initialExplain: string;
  initialAttempts: number;
  revealAfter: number;
  onProgress: (p: PrepProgress) => void;
}) {
  const [phase, setPhase] = useState<Phase>(solved ? "right" : "idle");
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string>("");
  const [multi, setMulti] = useState<string[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [explain, setExplain] = useState(initialExplain);
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState(initialAttempts);
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/exam-prep/${prepId}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, ...body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error ?? "הבדיקה לא הצליחה — נסו שוב");
    return d as { correct: boolean; explain: string; answer: string; attempts: number; progress: PrepProgress };
  };

  const check = async (value: unknown) => {
    setPhase("checking");
    setError(null);
    try {
      const d = await call({ answer: value });
      setAttempts(d.attempts);
      onProgress(d.progress);
      if (d.correct) {
        setExplain(d.explain);
        setPhase("right");
      } else setPhase("wrong");
    } catch (e) {
      setError(e instanceof Error ? e.message : "הבדיקה לא הצליחה");
      setPhase("error");
    }
  };

  const reveal = async () => {
    setRevealing(true);
    try {
      const d = await call({ reveal: true });
      setExplain(d.explain);
      setAnswer(d.answer);
      setRevealed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא הצליח");
    } finally {
      setRevealing(false);
    }
  };

  const done = phase === "right";
  const busy = phase === "checking";
  const value = item.kind === "choice" ? choice : item.kind === "multi" ? multi : text;
  const empty = item.kind === "multi" ? multi.length === 0 : item.kind === "choice" ? !choice : !text.trim();
  const words = item.kind === "etnachta" && item.verse ? item.verse.split(/\s+/) : [];
  const border = done ? "border-[color:var(--success)] bg-[color:var(--success)]/5" : phase === "wrong" ? "border-[color:var(--warning)]" : "border-[color:var(--border)] bg-[color:var(--background)]";

  return (
    <li className={`rounded-xl border-2 p-4 transition ${border}`}>
      <p className="text-[15px] font-medium leading-7">
        <span className="me-1 font-extrabold text-[color:var(--primary)]">{n}.</span>
        {item.text}
        {done && <span className="ms-2 text-sm font-extrabold text-[color:var(--success)]">✓</span>}
      </p>

      {item.kind === "etnachta" && item.verse && (
        <p className="font-mikra mt-2 rounded-lg bg-white px-3 py-2 text-[20px] leading-[2.6rem]">
          <span className="me-1 font-sans text-xs font-bold text-[color:var(--accent)]">({item.verseNum})</span>
          {words.map((w, i) => (
            <button
              key={i}
              type="button"
              disabled={done || busy}
              onClick={() => {
                setPicked(i);
                check(i);
              }}
              className={`mx-0.5 rounded px-0.5 transition ${picked === i ? (done ? "bg-[color:var(--success)]/25" : phase === "wrong" ? "bg-[color:var(--warning)]/25" : "bg-[color:var(--accent)]/20") : "hover:bg-[color:var(--accent)]/10"}`}
            >
              {w}
            </button>
          ))}
        </p>
      )}

      {item.kind === "choice" && (
        <div className="mt-2 space-y-1.5">
          {item.options.map((o) => (
            <label key={o} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-1.5 text-sm leading-6 transition ${choice === o ? "border-[color:var(--accent)] bg-white" : "border-transparent hover:bg-white"}`}>
              <input type="radio" className="mt-1.5" name={`q-${item.id}`} disabled={done} checked={choice === o} onChange={() => setChoice(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}
      {item.kind === "multi" && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {item.options.map((o) => (
            <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${multi.includes(o) ? "border-[color:var(--accent)] bg-white" : "border-transparent hover:bg-white"}`}>
              <input type="checkbox" disabled={done} checked={multi.includes(o)} onChange={(e) => setMulti((m) => (e.target.checked ? [...m, o] : m.filter((x) => x !== o)))} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}
      {(item.kind === "verse" || item.kind === "short") && !done && (
        <input
          className="mt-2 w-full max-w-xs rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
          placeholder={item.kind === "verse" ? "מספר הפסוק, למשל: י״ז" : "התשובה"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !empty && !busy) check(text);
          }}
        />
      )}
      {item.kind === "open" && !done && (
        <textarea className="mt-2 w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]" rows={3} placeholder="כתבו את התשובה שלכם" value={text} onChange={(e) => setText(e.target.value)} />
      )}

      {item.kind !== "etnachta" && !done && (
        <button
          type="button"
          disabled={empty || busy}
          onClick={() => check(value)}
          className={`mt-3 inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-sm font-bold text-white transition ${empty ? "cursor-not-allowed bg-[color:var(--primary)]/30" : busy ? "scale-[0.97] bg-[color:var(--primary)] opacity-90" : "bg-[color:var(--primary)] hover:scale-[1.03] active:scale-95"}`}
        >
          {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {busy ? "בודק…" : item.kind === "open" ? "סיימתי — להשוות לתשובה" : phase === "wrong" ? "בדיקה שוב" : "בדיקה"}
        </button>
      )}
      {item.kind === "etnachta" && busy && <p className="mt-2 text-xs font-bold text-[color:var(--primary)]/60">בודק…</p>}

      {done && (
        <div className="mt-3 rounded-lg bg-[color:var(--success)]/10 px-3 py-2 text-sm leading-6">
          <p className="font-extrabold text-[color:var(--success)]">{item.kind === "open" ? "✓ תשובה לדוגמה — השוו לשלכם:" : "✓ נכון!"}</p>
          {explain && <p className="whitespace-pre-wrap">{explain}</p>}
        </div>
      )}
      {phase === "wrong" && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold text-[color:var(--warning)]">לא בדיוק — חזרו לפסוק ונסו שוב.</span>
          {attempts >= revealAfter && !revealed && (
            <button type="button" onClick={reveal} disabled={revealing} className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--primary)]/40 px-3 py-1 text-xs font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 active:scale-95">
              {revealing && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
              {revealing ? "פותח…" : "הצגת התשובה"}
            </button>
          )}
        </div>
      )}
      {revealed && !done && (
        <div className="mt-2 rounded-lg bg-[color:var(--primary)]/5 px-3 py-2 text-sm leading-6">
          {answer && <p className="font-extrabold text-[color:var(--primary)]">התשובה: {answer}</p>}
          {explain && <p className="whitespace-pre-wrap">{explain}</p>}
          <p className="mt-1 text-xs text-[color:var(--primary)]/60">עכשיו ענו בעצמכם — השאלה נחשבת כשהתשובה שלכם נכונה.</p>
        </div>
      )}
      {phase === "error" && error && <p className="mt-2 text-xs font-bold text-[color:var(--danger)]">{error}</p>}
    </li>
  );
}

function ArgumentPractice({ prep, saved, onProgress }: { prep: StudentPrep; saved: PrepProgress["argument"]; onProgress: (p: PrepProgress) => void }) {
  const [ref, setRef] = useState(saved?.ref ?? "");
  const [claim, setClaim] = useState(saved?.claim ?? "");
  const [reason, setReason] = useState(saved?.reason ?? "");
  const [evidence, setEvidence] = useState(saved?.evidence ?? "");
  const [feedback, setFeedback] = useState(saved?.feedback ?? "");
  const [phase, setPhase] = useState<"idle" | "sending" | "done" | "error">(saved ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const ready = ref && claim.trim() && reason.trim() && evidence.trim();

  const send = async () => {
    setPhase("sending");
    setError(null);
    try {
      const r = await fetch(`/api/exam-prep/${prep.id}/argument`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, claim, reason, evidence }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error ?? "המשוב לא הגיע — נסו שוב");
      setFeedback(d.feedback);
      onProgress(d.progress);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "המשוב לא הגיע");
      setPhase("error");
    }
  };

  const area = "mt-1 w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]";
  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <h3 className="font-display text-lg font-extrabold text-[color:var(--primary)]">💬 תרגול טיעון</h3>
      {prep.argument.intro && <p className="mt-1 text-sm leading-6 text-[color:var(--foreground)]/80">{prep.argument.intro}</p>}
      <div className="mt-3 space-y-1.5">
        {prep.argument.questions.map((q) => (
          <label key={q.ref} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm leading-6 transition ${ref === q.ref ? "border-[color:var(--accent)] bg-white" : "border-[color:var(--border)] hover:bg-[color:var(--background)]"}`}>
            <input type="radio" className="mt-1.5" name={`arg-${prep.id}`} checked={ref === q.ref} onChange={() => setRef(q.ref)} />
            <span>{q.question}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-3">
        <label className="block text-xs font-bold text-[color:var(--primary)]/70">
          טענה — מה אני חושב/ת
          <textarea className={area} rows={2} value={claim} onChange={(e) => setClaim(e.target.value)} />
        </label>
        <label className="block text-xs font-bold text-[color:var(--primary)]/70">
          נימוק — למה
          <textarea className={area} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="block text-xs font-bold text-[color:var(--primary)]/70">
          ביסוס — ציטוט מהפרק ומספר הפסוק
          <textarea className={area} rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </label>
      </div>
      <button
        type="button"
        onClick={send}
        disabled={!ready || phase === "sending"}
        className={`mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white transition ${!ready ? "cursor-not-allowed opacity-40" : phase === "sending" ? "scale-[0.97] opacity-90" : "hover:scale-[1.03] active:scale-95"}`}
        style={{ background: "linear-gradient(135deg, var(--accent), var(--primary))" }}
      >
        {phase === "sending" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {phase === "sending" ? "קלוד קורא…" : feedback ? "✨ שליחה שוב למשוב" : "✨ משוב מקלוד"}
      </button>
      {phase === "error" && error && <p className="mt-2 text-xs font-bold text-[color:var(--danger)]">{error}</p>}
      {feedback && (
        <div className="mt-3 rounded-xl border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/5 px-4 py-3 text-sm leading-7">
          <p className="mb-1 text-xs font-extrabold text-[color:var(--accent)]">✨ משוב מקלוד</p>
          <p className="whitespace-pre-wrap">{feedback}</p>
        </div>
      )}
    </section>
  );
}
