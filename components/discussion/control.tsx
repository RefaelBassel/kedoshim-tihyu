"use client";

import { useEffect, useRef, useState } from "react";
import type { DiscussionState } from "@/lib/discussion";
import type { LessonPlan } from "@/lib/lesson-plan";
import { KIND_WORD, teacherUrl } from "@/lib/lesson-flow";

// The teacher's control page for the debate — built for her phone or her
// laptop screen, NEVER for the projected window. Everything here is one
// tap: who may speak (eligibility from the site + her override), tap a
// name to start their clock, type a key sentence and it pops on the board.
type Tag = "claim" | "reason" | null;

export default function DiscussionControl({ discussionId }: { discussionId: number }) {
  const [state, setState] = useState<DiscussionState | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [text, setText] = useState("");
  const [speaker, setSpeaker] = useState<string>("");
  const [tag, setTag] = useState<Tag>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [editingQ, setEditingQ] = useState(false);
  const [qDraft, setQDraft] = useState("");
  // today's plan, when this debate is the block running right now: ending
  // the debate moves the lesson on and takes the teacher to the next screen
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/lesson-plan", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setPlan(d.plan);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, []);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const apply = (d: { ok?: boolean; state?: DiscussionState }) => {
    if (d.ok && d.state) {
      setState(d.state);
      setOffset(d.state.now - Math.floor(Date.now() / 1000));
    }
  };
  const load = () =>
    fetch(`/api/discussions/${discussionId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(apply)
      .catch(() => {});
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/discussions/${discussionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      apply(await r.json());
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 2500);
    const clock = setInterval(() => setTick((t) => t + 1), 500);
    // students keep finishing during the lesson — re-read eligibility
    const elig = setInterval(() => act({ action: "refresh" }), 30000);
    return () => {
      clearInterval(iv);
      clearInterval(clock);
      clearInterval(elig);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussionId]);

  // the note composer defaults to whoever is speaking
  useEffect(() => {
    if (state?.activeTurn && !speaker) setSpeaker(state.activeTurn.name);
  }, [state?.activeTurn, speaker]);

  if (!state) {
    return <p className="p-6 text-center text-sm text-[color:var(--primary)]/60">טוען את הבקרה...</p>;
  }
  void tick;
  const nowS = Math.floor(Date.now() / 1000) + offset;
  const active = state.activeTurn;
  const remaining = active ? state.secondsPerSpeaker - (nowS - active.startedAt) : null;
  const mm = (s: number) => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
  const curBlock = plan && plan.current >= 0 ? plan.blocks[plan.current] : null;
  const isCurrentBlock = !!curBlock && curBlock.kind === "discussion" && curBlock.taskId === state.taskId;
  const nextBlock = isCurrentBlock && plan ? (plan.blocks[plan.current + 1] ?? null) : null;
  const endDebate = async () => {
    await act({ action: "close" });
    if (!isCurrentBlock) return;
    try {
      const r = await fetch("/api/lesson-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextBlock ? "next" : "stop" }),
      });
      const d = await r.json();
      if (d.ok) {
        window.dispatchEvent(new Event("lesson-plan-changed"));
        window.location.href = nextBlock ? teacherUrl(nextBlock.kind, nextBlock.taskId) : "/dashboard/lesson";
      }
    } catch {
      /* stay here */
    }
  };
  const eligible = state.participants.filter((p) => p.eligible);
  const notEligible = state.participants.filter((p) => !p.eligible);
  const approved = state.participants.filter((p) => p.approved);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    await act({ action: "note", text: t, speaker: speaker || active?.name || "—", tag });
    setText("");
    setFlash("עלה ללוח ✓");
    setTimeout(() => setFlash(null), 1500);
    textRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-40 pt-5" dir="rtl">
      {/* where this runs */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-xs text-[color:var(--primary)]/70">
        🖥️ <b>לוח הדיון</b> מוקרן על הפרוייקטור (חלון נפרד) · 🎫 <b>הכרטיסים, השעון והשאלה</b> — כאן, בטלפון או במחשב. כל מה שתעשי כאן מופיע שם תוך שנייה.
        {" "}
        <a
          href={`/dashboard/discussion/${state.taskId}/board`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-[color:var(--accent)] underline-offset-2 hover:underline"
        >
          לפתוח את הלוח בחלון חדש ↗
        </a>
      </div>

      {/* the question */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-[color:var(--primary)]/60">💬 שאלת הדיון</p>
          <button
            type="button"
            onClick={() => {
              setQDraft(state.question);
              setEditingQ((v) => !v);
            }}
            className="text-[11px] font-bold text-[color:var(--primary)]/60 hover:text-[color:var(--accent)]"
          >
            ✏️ {editingQ ? "ביטול" : "עריכה"}
          </button>
        </div>
        {editingQ ? (
          <div>
            <textarea
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm leading-7 outline-none focus:border-[color:var(--accent)]"
            />
            <button
              type="button"
              disabled={busy || !qDraft.trim()}
              onClick={async () => {
                await act({ action: "question", question: qDraft });
                setEditingQ(false);
              }}
              className="mt-2 rounded-full bg-[color:var(--primary)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              עדכון על הלוח
            </button>
          </div>
        ) : (
          <p className="font-display text-lg font-extrabold leading-snug text-[color:var(--primary)]">
            {state.question || <span className="text-[color:var(--warning)]">עוד לא נכתבה שאלה — לחצי ״עריכה״</span>}
          </p>
        )}
        {state.teacherNote && (
          <p className="mt-2 rounded-lg bg-[color:var(--background)] px-3 py-2 text-xs text-[color:var(--foreground)]/70">
            🗝️ לך בלבד: {state.teacherNote}
          </p>
        )}
      </section>

      {/* the clock */}
      <section
        className={`rounded-2xl border-2 p-4 ${active ? "border-[color:var(--accent)] bg-[color:var(--accent)]/6" : "border-[color:var(--border)] bg-[color:var(--card)]"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[color:var(--primary)]/60">⏱ עכשיו מדבר/ת</p>
            <p className="font-display text-xl font-extrabold text-[color:var(--primary)]">
              {active ? active.name : "אף אחד — לחצי על שם למטה"}
            </p>
          </div>
          <div className="text-end">
            <p
              className={`font-display text-4xl font-extrabold tabular-nums ${remaining != null && remaining < 0 ? "text-[color:var(--danger)]" : "text-[color:var(--primary)]"}`}
            >
              {remaining != null ? mm(remaining) : mm(state.secondsPerSpeaker)}
            </p>
            <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[color:var(--primary)]/60">
              <button type="button" onClick={() => act({ action: "seconds", seconds: state.secondsPerSpeaker - 15 })} className="rounded-full border border-[color:var(--border)] px-2">−15</button>
              <span>{state.secondsPerSpeaker} שנ׳ לדובר/ת</span>
              <button type="button" onClick={() => act({ action: "seconds", seconds: state.secondsPerSpeaker + 15 })} className="rounded-full border border-[color:var(--border)] px-2">+15</button>
            </div>
          </div>
        </div>
        {active && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act({ action: "stop" })}
            className="mt-3 w-full rounded-full bg-[color:var(--danger)] py-3 text-base font-bold text-white shadow transition active:scale-95 disabled:opacity-50"
          >
            ⏹ לעצור את השעון
          </button>
        )}
      </section>

      {/* who may speak — tap to start their clock */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-display text-base font-extrabold text-[color:var(--primary)]">
            🎫 כרטיסי כניסה לדיון
            <span className="ms-2 rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-xs text-white">{approved.length} מתוך {state.participants.length} עם כרטיס</span>
          </p>
          <button
            type="button"
            onClick={() => act({ action: "refresh" })}
            className="text-[11px] font-bold text-[color:var(--primary)]/60 hover:text-[color:var(--accent)]"
          >
            ↻ לרענן מי סיים/ה
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-5 text-[color:var(--primary)]/60">
          כרטיס מקבל/ת מי שענה/תה על כל שאלות היחידה. אפשר לתת כרטיס ידנית למי שעוד לא סיים/ה. לחיצה על כרטיס מפעילה את השעון של הדובר/ת.
        </p>
        {eligible.length === 0 && <p className="mb-2 text-xs text-[color:var(--warning)]">עדיין אף אחד/ת לא סיים/ה את היחידה.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {eligible.map((p) => (
            <SpeakerTile
              key={p.userId}
              p={p}
              isActive={active?.userId === p.userId}
              onStart={() => act({ action: "start", userId: p.userId, name: p.name })}
              onToggle={() => act({ action: "approve", userId: p.userId, approved: !p.approved })}
              busy={busy}
            />
          ))}
        </div>
        {notEligible.length > 0 && (
          <div className="mt-4 border-t border-dashed border-[color:var(--border)] pt-3">
            <p className="mb-2 text-[11px] font-bold text-[color:var(--warning)]">
              ⏳ עוד בלי כרטיס ({notEligible.length}) — לא סיימו את היחידה. אפשר לתת כרטיס ידנית.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {notEligible.map((p) => (
                <SpeakerTile
                  key={p.userId}
                  p={p}
                  isActive={active?.userId === p.userId}
                  onStart={() => act({ action: "start", userId: p.userId, name: p.name })}
                  onToggle={() => act({ action: "approve", userId: p.userId, approved: !p.approved })}
                  busy={busy}
                  dim
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* notes already on the wall */}
      {state.notes.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
          <p className="mb-2 text-xs font-bold text-[color:var(--primary)]/60">🧱 על הקיר ({state.notes.length})</p>
          <ul className="space-y-1.5">
            {state.notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2 rounded-lg bg-[color:var(--background)] px-3 py-2 text-sm">
                <span>
                  <b>{n.speaker}:</b> {n.text}
                  {n.tag && <span className="ms-1 text-[10px] text-[color:var(--accent)]">({n.tag === "claim" ? "טענה" : "נימוק"})</span>}
                </span>
                <button
                  type="button"
                  onClick={() => act({ action: "deleteNote", noteId: n.id })}
                  aria-label="מחיקה"
                  className="shrink-0 text-xs text-[color:var(--danger)]/70 hover:text-[color:var(--danger)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-between gap-3">
        {state.status === "open" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const tail = nextBlock
                ? ` השיעור ימשיך ל${KIND_WORD[nextBlock.kind].label} · ${nextBlock.title}, והלוח המוקרן יעבור לשם לבד.`
                : isCurrentBlock
                  ? " זה הבלוק האחרון — השיעור יסתיים."
                  : "";
              if (window.confirm(`לסיים את הדיון? הדיון יישמר בתיעוד.${tail}`)) void endDebate();
            }}
            className={`rounded-full px-4 py-2 text-sm font-extrabold shadow transition active:scale-95 disabled:opacity-50 ${isCurrentBlock ? "bg-[color:var(--success)] text-white" : "border border-[color:var(--border)] text-[color:var(--primary)]/70 hover:border-[color:var(--danger)] hover:text-[color:var(--danger)]"}`}
          >
            {nextBlock ? `✓ סיום הדיון והלאה ל${KIND_WORD[nextBlock.kind].label}` : isCurrentBlock ? "✓ סיום הדיון והשיעור" : "סיום הדיון"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => act({ action: "reopen" })}
            className="rounded-full bg-[color:var(--success)] px-4 py-1.5 text-xs font-bold text-white"
          >
            לפתוח מחדש
          </button>
        )}
        <a href={`/dashboard/task/${state.taskId}`} className="text-xs font-semibold text-[color:var(--primary)]/60 hover:underline">
          → חזרה לעמוד המשימה
        </a>
      </div>

      {/* the composer — sticky at the bottom, always one thumb away */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--border)] bg-[color:var(--card)]/95 px-4 pb-4 pt-3 shadow-[0_-10px_30px_-20px_rgba(46,36,56,0.4)] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-[color:var(--primary)]/60">מי אמר/ה:</span>
            {approved.slice(0, 12).map((p) => (
              <button
                key={p.userId}
                type="button"
                onClick={() => setSpeaker(p.name)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                  speaker === p.name ? "bg-[color:var(--primary)] text-white" : "border border-[color:var(--border)] text-[color:var(--primary)]/70"
                }`}
              >
                {p.name}
              </button>
            ))}
            <input
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="או שם אחר…"
              className="w-28 rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-2.5 py-0.5 text-[11px] outline-none focus:border-[color:var(--accent)]"
            />
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="משפט מפתח מהדובר/ת… (Enter שולח ללוח)"
              className="min-w-0 flex-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-2.5 text-base leading-6 outline-none focus:border-[color:var(--accent)]"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !text.trim()}
              className="h-12 shrink-0 rounded-2xl bg-[color:var(--accent)] px-5 text-base font-bold text-white shadow transition active:scale-95 disabled:opacity-40"
            >
              ללוח ↑
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {(["claim", "reason", null] as Tag[]).map((t) => (
              <button
                key={String(t)}
                type="button"
                onClick={() => setTag(t)}
                className={`rounded-full px-3 py-0.5 text-[11px] font-bold transition ${
                  tag === t
                    ? t === "claim"
                      ? "bg-[color:var(--primary)] text-white"
                      : t === "reason"
                        ? "bg-[color:var(--accent)] text-white"
                        : "bg-[color:var(--foreground)]/70 text-white"
                    : "border border-[color:var(--border)] text-[color:var(--primary)]/60"
                }`}
              >
                {t === "claim" ? "טענה" : t === "reason" ? "נימוק" : "בלי תג"}
              </button>
            ))}
            {flash && <span className="ms-auto text-xs font-bold text-[color:var(--success)]">{flash}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeakerTile({
  p,
  isActive,
  onStart,
  onToggle,
  busy,
  dim,
}: {
  p: DiscussionState["participants"][number];
  isActive: boolean;
  onStart: () => void;
  onToggle: () => void;
  busy: boolean;
  dim?: boolean;
}) {
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const held = p.approved;
  // a ticket: a stub with a perforation, punched at the edges; without a
  // ticket the tile is a faint dashed outline waiting to be filled
  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 transition ${
        isActive
          ? "border-[color:var(--accent)] text-white shadow-lg"
          : held
            ? "border-[color:var(--accent)]/70 text-[color:var(--primary)]"
            : "border-dashed border-[color:var(--border)] text-[color:var(--primary)]/60"
      }`}
      style={{
        background: isActive
          ? "var(--accent)"
          : held
            ? "linear-gradient(180deg, color-mix(in srgb, var(--accent) 24%, var(--card)) 0 22px, color-mix(in srgb, var(--accent) 8%, var(--card)) 22px)"
            : "var(--background)",
      }}
    >
      {/* punched holes on the perforation line */}
      {held && !isActive && (
        <>
          <span aria-hidden className="absolute -left-2 top-[18px] h-4 w-4 rounded-full bg-[color:var(--card)]" style={{ boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--accent) 70%, transparent)" }} />
          <span aria-hidden className="absolute -right-2 top-[18px] h-4 w-4 rounded-full bg-[color:var(--card)]" style={{ boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--accent) 70%, transparent)" }} />
          <span aria-hidden className="absolute inset-x-3 top-[25px] border-t border-dashed" style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }} />
        </>
      )}
      <div className={`flex items-center justify-between px-3 text-[10px] font-extrabold tracking-wide ${held || isActive ? "h-[22px]" : "h-[22px] opacity-70"}`}>
        <span>{isActive ? "⏱ מדבר/ת עכשיו" : held ? "🎫 כרטיס כניסה" : "▫️ בלי כרטיס"}</span>
        {held && !isActive && p.turns > 0 && <span className="opacity-70">דיבר/ה {mm(p.spokeSeconds)}</span>}
      </div>
      <button
        type="button"
        disabled={busy || !held}
        onClick={onStart}
        className="block w-full px-3 pb-1 pt-2 text-start disabled:cursor-default"
        title={held ? "להפעיל את השעון של הדובר/ת" : "עוד בלי כרטיס"}
      >
        <p className="truncate text-sm font-extrabold">{p.name}</p>
        <p className={`text-[10px] ${isActive ? "text-white/85" : "opacity-70"}`}>
          {p.eligible ? "ענה/תה על כל השאלות ✓" : held ? `ניתן ידנית · ${p.answered}/${p.total} שאלות` : `${p.answered}/${p.total} שאלות`}
        </p>
      </button>
      <div className="flex items-center gap-1 px-2 pb-2">
        {held ? (
          <>
            {!isActive && (
              <button type="button" disabled={busy} onClick={onStart} className="flex-1 rounded-full bg-[color:var(--accent)] py-1 text-[11px] font-extrabold text-white shadow active:scale-95 disabled:opacity-50">
                ▶ להפעיל שעון
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onToggle}
              className={`rounded-full px-2 py-1 text-[10px] font-bold ${isActive ? "bg-white/20 text-white" : "text-[color:var(--danger)]/80 hover:bg-[color:var(--danger)]/10"}`}
              title="להסיר את הכרטיס"
            >
              להסיר כרטיס
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={onToggle} className="flex-1 rounded-full border-2 border-[color:var(--accent)] py-1 text-[11px] font-extrabold text-[color:var(--accent)] transition hover:bg-[color:var(--accent)] hover:text-white active:scale-95 disabled:opacity-50">
            🎫 לתת כרטיס
          </button>
        )}
      </div>
      {dim && !held && <span className="sr-only">בלי כרטיס</span>}
    </div>
  );
}
