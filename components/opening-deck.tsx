"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { slideSteps, type OpeningDeck, type OpeningSlide } from "@/content/openings/types";

// מצגת פתיחה — the 3–5 minute opening that gathers the class around the
// screen and hands it straight to the lesson. Same controls as the review
// deck (RTL-forward keys, click, swipe, fullscreen, Esc), darker and slower:
// gold on near-black for the cinema, white linen (the priest's בגדי בד) for
// the slides the class works with. Some slides take clicks of their own
// (timer, answer, map parts) before the deck moves on.

const GOLD = "#d9b46c";
const LINEN = "#f4efe3";
const INK = "#2e2438";
const GRAPE = "#413055";
const PART_COLORS = ["#413055", "#b96a3b", "#3e6b4f", "#b3892b", "#9d3438"];

function delay(s: number): CSSProperties {
  return { animationDelay: `${s}s` };
}

function DarkStage({ children }: { children: ReactNode }) {
  return (
    <section
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-8 py-16 text-center"
      style={{ background: "radial-gradient(1100px 640px at 50% 45%, #3a2b14 0%, #1c150b 55%, #0b0905 100%)", color: LINEN }}
    >
      <span
        aria-hidden
        className="opening-glow pointer-events-none absolute left-1/2 top-1/2 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, ${GOLD}2e 0%, transparent 62%)` }}
      />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-8">{children}</div>
    </section>
  );
}

function LinenStage({ children }: { children: ReactNode }) {
  return (
    <section
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-8 py-14 text-center"
      style={{
        // a faint weave: the linen of the בגדי בד
        backgroundImage: `repeating-linear-gradient(0deg, ${INK}06 0 1px, transparent 1px 5px), repeating-linear-gradient(90deg, ${INK}05 0 1px, transparent 1px 6px), radial-gradient(1000px 520px at 50% 0%, #fffdf7 0%, ${LINEN} 60%, #e8dfcd 100%)`,
        color: INK,
      }}
    >
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-8">{children}</div>
    </section>
  );
}

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className="deck-fade text-lg font-bold tracking-[0.3em] sm:text-xl" style={{ color: dark ? GOLD : "#8a5a1e" }}>
      {children}
    </p>
  );
}

function RevealSlide({ s }: { s: Extract<OpeningSlide, { kind: "reveal" }> }) {
  const gap = 1.7;
  return (
    <DarkStage>
      <div className="flex flex-col items-center gap-6">
        {s.lines.map((line, i) => (
          <p key={i} className="opening-rise font-display text-5xl font-extrabold leading-tight sm:text-7xl" style={delay(0.5 + i * gap)}>
            {line}
          </p>
        ))}
      </div>
      {s.finale && (
        <div className="opening-rise mt-6 flex flex-col items-center gap-3" style={delay(0.9 + s.lines.length * gap)}>
          <span aria-hidden className="h-px w-40" style={{ background: `${GOLD}aa` }} />
          <p className="font-mikra text-6xl leading-relaxed sm:text-8xl" style={{ color: GOLD }}>
            {s.finale.quote}
          </p>
          <p className="text-xl text-white/60 sm:text-2xl">({s.finale.source})</p>
        </div>
      )}
    </DarkStage>
  );
}

function QuestionSlide({ s }: { s: Extract<OpeningSlide, { kind: "question" }> }) {
  return (
    <LinenStage>
      <Eyebrow>{s.eyebrow}</Eyebrow>
      <div className="flex w-full flex-col items-stretch gap-5 sm:flex-row sm:justify-center">
        {s.facts.map((f, i) => (
          <div
            key={i}
            className="deck-fade flex flex-1 flex-col items-center gap-2 rounded-3xl border px-6 py-6 shadow-sm"
            style={{ ...delay(0.3 + i * 0.5), borderColor: "#e0d4bf", background: "#fffdf8cc" }}
          >
            <span className="font-display text-8xl font-extrabold leading-none tabular-nums sm:text-9xl" style={{ color: i === 0 ? GRAPE : "#b96a3b" }}>
              {f.big}
            </span>
            <span className="text-2xl font-semibold sm:text-3xl">{f.text}</span>
          </div>
        ))}
      </div>
      <p className="opening-rise font-display text-6xl font-extrabold sm:text-7xl" style={{ ...delay(1.5), color: GRAPE }}>
        {s.ask}
      </p>
      {s.note && (
        <p className="deck-fade text-xl text-[color:var(--foreground)]/60" style={delay(2.2)}>
          {s.note}
        </p>
      )}
    </LinenStage>
  );
}

function Timer({ seconds, running, frozen }: { seconds: number; running: boolean; frozen: boolean }) {
  const [left, setLeft] = useState(seconds);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!running) startedAt.current = null; // rolled back before the start: the next start is fresh
    if (!running || frozen) return;
    if (startedAt.current == null) startedAt.current = Date.now();
    const tick = () => setLeft(Math.max(0, seconds - Math.floor((Date.now() - startedAt.current!) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, frozen, seconds]);

  const r = 88;
  const circ = 2 * Math.PI * r;
  const shown = running ? left : seconds;
  const over = running && shown === 0;
  const color = over ? "#e0675f" : shown <= 10 && running ? "#e3a548" : GOLD;
  return (
    <div className="relative flex h-60 w-60 items-center justify-center sm:h-72 sm:w-72">
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={r} fill="none" stroke="#ffffff1a" strokeWidth="10" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - shown / seconds)}
          style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.3s" }}
        />
      </svg>
      <span className={`font-display font-extrabold tabular-nums ${over ? "text-5xl" : "text-8xl sm:text-9xl"}`} style={{ color }}>
        {over ? "⏰ הזמן!" : shown}
      </span>
    </div>
  );
}

function ChallengeSlide({ s, step, onStep }: { s: Extract<OpeningSlide, { kind: "challenge" }>; step: number; onStep: () => void }) {
  const running = step >= 1;
  const revealed = step >= 2;
  return (
    <DarkStage>
      <Eyebrow dark>{s.eyebrow}</Eyebrow>
      <p className="deck-fade text-3xl font-semibold sm:text-4xl" style={delay(0.2)}>
        {s.instruction}
      </p>
      <p className="opening-rise font-mikra text-5xl leading-relaxed sm:text-7xl" style={{ ...delay(0.5), color: GOLD }}>
        {s.quote}?
      </p>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-12">
        <Timer seconds={s.seconds} running={running} frozen={revealed} />
        {revealed ? (
          <div className="deck-pop flex flex-col items-center gap-1 rounded-3xl px-10 py-6" style={{ background: GOLD, color: "#1c150b" }}>
            <span className="text-lg font-bold">התשובה</span>
            <span className="font-display text-6xl font-extrabold sm:text-7xl">{s.answer}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStep();
            }}
            className="rounded-full border-2 px-8 py-4 text-2xl font-extrabold transition hover:scale-[1.04] active:scale-95"
            style={running ? { borderColor: `${GOLD}aa`, color: GOLD } : { borderColor: GOLD, background: GOLD, color: "#1c150b" }}
          >
            {running ? "👁️ חשיפת התשובה" : "▶ הפעלת הטיימר"}
          </button>
        )}
      </div>
    </DarkStage>
  );
}

function MapSlide({ s, step }: { s: Extract<OpeningSlide, { kind: "map" }>; step: number }) {
  return (
    <LinenStage>
      <Eyebrow>{s.eyebrow}</Eyebrow>
      <p className="deck-fade font-display text-4xl font-extrabold leading-snug sm:text-5xl" style={{ ...delay(0.2), color: GRAPE }}>
        {s.heading}
      </p>
      <div className="deck-fade w-full" style={delay(0.4)}>
        <div className="mb-2 flex justify-between text-lg font-bold text-[color:var(--foreground)]/55">
          <span>{s.from}</span>
          <span>{s.to}</span>
        </div>
        {/* the whole chapter; part widths are equal on purpose — no hint at the verse boundaries */}
        <div className="flex h-20 w-full overflow-hidden rounded-2xl border-2 sm:h-24" style={{ borderColor: "#d8ccb6", background: "#fffdf8" }}>
          {s.parts.map((_, i) => (
            <div key={i} className="relative h-full flex-1" style={{ borderInlineStart: i > 0 ? "2px dashed #e0d4bf" : undefined }}>
              {i < step && <div className="opening-fill absolute inset-0" style={{ background: PART_COLORS[i % PART_COLORS.length] }} />}
              {i < step && (
                <span className="opening-in absolute inset-0 flex items-center justify-center font-display text-3xl font-extrabold text-white sm:text-4xl" style={delay(0.4)}>
                  {i + 1}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <ol className="grid w-full gap-3 sm:grid-cols-5">
        {s.parts.map((p, i) => (
          <li
            key={i}
            className="rounded-2xl border-2 px-3 py-3 text-xl font-bold leading-snug transition-all duration-700 sm:text-2xl"
            style={
              i < step
                ? { borderColor: PART_COLORS[i % PART_COLORS.length], color: PART_COLORS[i % PART_COLORS.length], background: "#fffdf8" }
                : { borderColor: "#e0d4bf", color: `${INK}40`, background: "transparent" }
            }
          >
            {i + 1} · {i < step ? p : "?"}
          </li>
        ))}
      </ol>
      <p className="text-lg text-[color:var(--foreground)]/50">
        {step < s.parts.length ? `לחיצה — החלק הבא (${step} / ${s.parts.length})` : "בדף העבודה: מאיזה פסוק עד איזה פסוק?"}
      </p>
    </LinenStage>
  );
}

function LaunchSlide({ s, href, toBoard }: { s: Extract<OpeningSlide, { kind: "launch" }>; href: string; toBoard: boolean }) {
  const [going, setGoing] = useState(false);
  return (
    <DarkStage>
      <p className="opening-rise font-display text-6xl font-extrabold leading-tight sm:text-7xl" style={delay(0.2)}>
        {s.title}
      </p>
      {s.sub && (
        <p className="deck-fade text-2xl text-white/65" style={delay(0.9)}>
          {s.sub}
        </p>
      )}
      <a
        href={href}
        onClick={(e) => {
          e.stopPropagation();
          setGoing(true);
        }}
        className={`deck-pop mt-4 rounded-full px-12 py-5 text-3xl font-extrabold shadow-2xl transition hover:scale-[1.04] active:scale-95 ${going ? "animate-pulse" : ""}`}
        style={{ ...delay(1.3), background: GOLD, color: "#1c150b" }}
      >
        {going ? "פותחים…" : toBoard ? "🖥️ ללוח הכיתה ←" : "← חזרה למהלך השיעור"}
      </a>
    </DarkStage>
  );
}

export default function OpeningDeckPlayer({
  deck,
  title,
  taskId,
}: {
  deck: OpeningDeck;
  title: string;
  taskId: number | null;
}) {
  const slides = deck.slides;
  const count = slides.length;
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const swiped = useRef(false); // a swipe ends in a click too — count it once
  const backHref = taskId != null ? `/dashboard/task/${taskId}` : "/dashboard/lesson";
  const launchHref = taskId != null ? `/dashboard/class-board/${taskId}` : "/dashboard/lesson";

  const jump = useCallback(
    (n: number, atEnd = false) => {
      const i = Math.max(0, Math.min(count - 1, n));
      setIdx(i);
      // stepping back onto a slide shows it complete; jumping forward starts it fresh
      setStep(atEnd ? slideSteps(slides[i]) : 0);
    },
    [count, slides]
  );

  const next = useCallback(() => {
    if (step < slideSteps(slides[idx])) setStep(step + 1);
    else if (idx < count - 1) jump(idx + 1);
  }, [step, idx, count, slides, jump]);

  const prev = useCallback(() => {
    if (step > 0) setStep(step - 1);
    else if (idx > 0) jump(idx - 1, true);
  }, [step, idx, jump]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === " " || e.key === "Enter" || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowRight" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") jump(0);
      else if (e.key === "End") jump(count - 1);
      else if (e.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else window.location.href = backHref;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, jump, count, backHref]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  const s = slides[idx];
  let body: ReactNode;
  switch (s.kind) {
    case "reveal":
      body = <RevealSlide s={s} />;
      break;
    case "question":
      body = <QuestionSlide s={s} />;
      break;
    case "challenge":
      body = <ChallengeSlide s={s} step={step} onStep={next} />;
      break;
    case "map":
      body = <MapSlide s={s} step={step} />;
      break;
    case "launch":
      body = <LaunchSlide s={s} href={launchHref} toBoard={taskId != null} />;
      break;
  }
  const isLast = idx === count - 1 && step >= slideSteps(s);

  const chrome: CSSProperties = { borderColor: "#ffffff14", background: "rgba(11,9,5,0.88)", color: GOLD };
  const pill = "rounded-full border px-3 py-1 text-xs font-semibold";

  return (
    <div ref={rootRef} dir="rtl" className="fixed inset-0 z-[70] flex flex-col overflow-hidden" style={{ background: "#0b0905" }}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2" style={chrome}>
        <div className="flex items-center gap-3">
          <a href={backHref} className={pill} style={{ borderColor: `${GOLD}55`, color: GOLD }}>
            → יציאה מהמצגת
          </a>
          <span className="hidden text-sm font-semibold sm:inline">▶ פתיחה · {title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums" style={{ color: `${GOLD}99` }}>
            {idx + 1} / {count}
          </span>
          <button type="button" onClick={toggleFullscreen} className={pill} style={{ borderColor: `${GOLD}55`, color: GOLD }}>
            ⛶ מסך מלא
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 cursor-pointer select-none overflow-hidden"
        onClick={() => {
          if (swiped.current) swiped.current = false;
          else next();
        }}
        onPointerDown={(e) => {
          touchStart.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const st = touchStart.current;
          touchStart.current = null;
          if (st == null) return;
          const dx = e.clientX - st;
          if (Math.abs(dx) > 60) {
            swiped.current = true;
            window.setTimeout(() => (swiped.current = false), 400);
            if (dx > 0) next();
            else prev();
          }
        }}
      >
        <div key={idx} className="opening-in absolute inset-0 overflow-y-auto">
          {body}
        </div>
        {/* Hebrew reads right to left: the previous slide is to the RIGHT, the next to the LEFT */}
        {(idx > 0 || step > 0) && (
          <button
            type="button"
            aria-label="אחורה"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-lg shadow-sm transition hover:scale-110"
            style={{ borderColor: `${GOLD}55`, background: "rgba(11,9,5,0.6)", color: GOLD }}
          >
            ›
          </button>
        )}
        {!isLast && (
          <button
            type="button"
            aria-label="קדימה"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-lg shadow-sm transition hover:scale-110"
            style={{ borderColor: `${GOLD}55`, background: "rgba(11,9,5,0.6)", color: GOLD }}
          >
            ‹
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t px-4 py-2.5" style={chrome}>
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`מעבר לשקף ${i + 1}`}
            onClick={() => jump(i)}
            className="rounded-full transition-all"
            style={{ width: i === idx ? 22 : 8, height: 8, background: i === idx ? GOLD : i < idx ? `${GOLD}88` : "#ffffff22" }}
          />
        ))}
      </div>
    </div>
  );
}
