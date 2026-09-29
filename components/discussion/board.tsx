"use client";

import { useEffect, useState } from "react";
import type { DiscussionState } from "@/lib/discussion";

// The projected debate board — INPUT-FREE. Full screen on the projector,
// polled from the server every 1.5 s; everything the teacher does happens on
// her separate control page. Right pane: the question, the speakers and the
// running clock. Left pane: the wall — key sentences the teacher types,
// which pop in as they arrive.
export default function DiscussionBoard({ discussionId }: { discussionId: number }) {
  const [state, setState] = useState<DiscussionState | null>(null);
  const [offset, setOffset] = useState(0); // server now - client now (s)
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/discussions/${discussionId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d.ok) return;
          setState(d.state);
          setOffset(d.state.now - Math.floor(Date.now() / 1000));
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 1500);
    const clock = setInterval(() => setTick((t) => t + 1), 250);
    return () => {
      alive = false;
      clearInterval(iv);
      clearInterval(clock);
    };
  }, [discussionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.location.href = state ? `/dashboard/task/${state.taskId}` : "/dashboard";
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-lg text-[color:var(--primary)]/60">
        טוען את לוח הדיון...
      </div>
    );
  }
  void tick;
  const nowS = Math.floor(Date.now() / 1000) + offset;
  const active = state.activeTurn;
  const elapsed = active ? Math.max(0, nowS - active.startedAt) : 0;
  const remaining = active ? state.secondsPerSpeaker - elapsed : state.secondsPerSpeaker;
  const over = active && remaining < 0;
  const frac = active ? Math.min(1, elapsed / state.secondsPerSpeaker) : 0;
  const speakers = state.participants.filter((p) => p.approved);
  const R = 84;
  const C = 2 * Math.PI * R;
  const mm = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto"
      style={{ background: "var(--background)" }}
      dir="rtl"
    >
      <a
        href={`/dashboard/task/${state.taskId}`}
        aria-label="יציאה מהלוח"
        title="יציאה (או Esc)"
        className="fixed top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] text-sm font-bold text-[color:var(--primary)]/70 opacity-40 shadow-sm transition hover:opacity-100"
        style={{ insetInlineEnd: 12 }}
      >
        ✕
      </a>

      {/* the question — across the top, grape band */}
      <header
        className="px-10 py-6 text-white"
        style={{ background: "linear-gradient(135deg, #2a1f3a 0%, #413055 60%, #5a4574 100%)" }}
      >
        <p className="mb-1 text-xs font-semibold tracking-[0.35em] text-white/60">
          💬 דיון · {state.bookRef} · {state.taskTitle}
        </p>
        <h1 className="font-display text-3xl font-extrabold leading-snug sm:text-4xl">
          {state.question || "…"}
        </h1>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-6 px-8 py-6 lg:grid-cols-[2fr_3fr]">
        {/* speakers + clock */}
        <section className="flex flex-col gap-5">
          <div className="flex items-center justify-center rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-sm">
            <div className="relative" style={{ width: 220, height: 220 }}>
              <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
                <circle cx="100" cy="100" r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
                <circle
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={over ? "var(--danger)" : frac > 0.8 ? "var(--warning)" : "var(--accent)"}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - frac)}
                  style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.4s" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p
                  className={`font-display text-5xl font-extrabold tabular-nums ${over ? "text-[color:var(--danger)] board-blink" : "text-[color:var(--primary)]"}`}
                >
                  {over ? `-${mm(remaining)}` : mm(remaining)}
                </p>
                <p className="mt-1 max-w-[160px] truncate text-sm font-bold text-[color:var(--accent)]">
                  {active ? active.name : "מי מדבר/ת?"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm">
            <p className="mb-3 text-xs font-bold tracking-wide text-[color:var(--primary)]/60">
              🎤 דוברים ודוברות · {speakers.length}
            </p>
            {speakers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--accent)]/50 px-4 py-3 text-center" style={{ background: "color-mix(in srgb, var(--accent) 6%, var(--card))" }}>
                <p className="text-2xl">🎫</p>
                <p className="mt-1 text-sm font-bold text-[color:var(--primary)]">כרטיסי הכניסה נבדקים עכשיו</p>
                <p className="text-xs text-[color:var(--primary)]/60">מי שענה/תה על כל שאלות היחידה נכנס/ת לדיון. עוד רגע.</p>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {speakers.map((p) => {
                  const isActive = active?.userId === p.userId;
                  return (
                    <li
                      key={p.userId}
                      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-base font-bold transition ${
                        isActive
                          ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white shadow-md"
                          : p.turns > 0
                            ? "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--primary)]/70"
                            : "border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--primary)]"
                      }`}
                    >
                      {isActive && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />}
                      {p.name}
                      {p.turns > 0 && !isActive && (
                        <span className="text-[11px] font-semibold opacity-70">· {mm(p.spokeSeconds)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* the wall */}
        <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-sm">
          <p className="mb-3 text-xs font-bold tracking-wide text-[color:var(--primary)]/60">
            🧱 הקיר — משפטי מפתח מהדיון
          </p>
          {state.notes.length === 0 ? (
            <p className="text-base text-[color:var(--primary)]/45">
              כאן יופיעו המשפטים שהמורה רושמת תוך כדי הדיון.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {state.notes.map((n, i) => (
                <li
                  key={n.id}
                  className={`note-pop rounded-2xl border p-4 ${
                    n.tag === "claim"
                      ? "border-[color:var(--primary)]/40 bg-[color:var(--primary)]/6"
                      : n.tag === "reason"
                        ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/8"
                        : "border-[color:var(--border)] bg-[color:var(--background)]"
                  }`}
                  style={{ animationDelay: i === 0 ? "0s" : "0s" }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-display text-base font-extrabold text-[color:var(--primary)]">
                      {n.speaker}
                    </span>
                    {n.tag && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                        style={{ background: n.tag === "claim" ? "var(--primary)" : "var(--accent)" }}
                      >
                        {n.tag === "claim" ? "טענה" : "נימוק"}
                      </span>
                    )}
                  </div>
                  <p className="text-lg leading-8 text-[color:var(--foreground)]">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="flex items-center justify-between px-8 pb-4 text-xs text-[color:var(--primary)]/45">
        <span>{state.secondsPerSpeaker} שניות לדובר/ת · {state.status === "closed" ? "הדיון נסגר" : "הדיון פתוח"}</span>
        <span>מתעדכן אוטומטית</span>
      </footer>
    </div>
  );
}
