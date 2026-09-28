"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ReviewDeck, DiscussionQuestion } from "@/content/tasks/types";
import { ReviewEditor } from "./dashboard/unit-text-editors";

// מצגת החזרה — the 5-minute reminder that opens a lesson before the debate.
// Deliberately terse: title → one short point per slide → the unit's skill
// → the discussion question ("עכשיו — לדיון"). A reminder for those who
// studied, never a substitute for studying (Reut). Same motion language as
// the musar / zoo decks; RTL-forward keys, swipe, fullscreen, Esc.

const GRAPE = "#413055";
const COPPER = "#b96a3b";

function fade(delay: number, extra = ""): { className: string; style: CSSProperties } {
  return { className: `deck-fade ${extra}`.trim(), style: { animationDelay: `${delay}s` } };
}
function pop(delay: number, extra = ""): { className: string; style: CSSProperties } {
  return { className: `deck-pop ${extra}`.trim(), style: { animationDelay: `${delay}s` } };
}

function Motif({ delay = 0 }: { delay?: number }) {
  return (
    <div aria-hidden {...fade(delay, "flex items-center justify-center gap-3")}>
      <span className="h-px w-14" style={{ background: `${COPPER}99` }} />
      <span className="h-2.5 w-2.5 rotate-45" style={{ background: COPPER }} />
      <span className="h-px w-14" style={{ background: `${COPPER}99` }} />
    </div>
  );
}

function DarkSlide({ children }: { children: ReactNode }) {
  return (
    <section
      className="deck-pan relative flex min-h-full flex-col items-center justify-center overflow-hidden px-8 py-16 text-center text-white"
      style={{ backgroundImage: `radial-gradient(1200px 600px at 70% -10%, #6a5585 0%, ${GRAPE} 45%, #2a1f3a 100%)` }}
    >
      <span aria-hidden className="deck-float absolute start-[10%] top-[12%] h-3 w-3 rotate-45" style={{ background: `${COPPER}b3` }} />
      <span aria-hidden className="deck-float absolute bottom-[18%] end-[12%] h-2 w-2 rotate-45" style={{ background: `${COPPER}80`, animationDelay: "1.4s" }} />
      <span aria-hidden className="deck-float absolute end-[18%] top-[24%] h-24 w-24 rounded-full border border-white/10" style={{ animationDelay: "0.7s" }} />
      <span aria-hidden className="deck-float absolute bottom-[10%] start-[16%] h-36 w-36 rounded-full border border-white/5" style={{ animationDelay: "2s" }} />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-6">{children}</div>
    </section>
  );
}

function LightSlide({ children, watermark }: { children: ReactNode; watermark?: string }) {
  return (
    <section
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-8 py-14 text-center"
      style={{
        background: `radial-gradient(900px 480px at 85% 0%, ${GRAPE}1f 0%, transparent 60%), radial-gradient(700px 420px at 0% 100%, ${COPPER}14 0%, transparent 55%), #fbf6f1`,
        color: "#2e2438",
      }}
    >
      {watermark && (
        <span
          aria-hidden
          className="deck-float pointer-events-none absolute -start-6 top-1/2 -translate-y-1/2 select-none font-display font-extrabold leading-none"
          style={{ color: `${GRAPE}0d`, fontSize: "30rem" }}
        >
          {watermark}
        </span>
      )}
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-6">{children}</div>
    </section>
  );
}

function Chip({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <span
      {...pop(delay, "mx-auto inline-block rounded-full px-5 py-2 text-base font-bold tracking-wide shadow-sm")}
      style={{ ...pop(delay).style, rotate: "-2deg", background: `${COPPER}33`, color: "#7a4322" }}
    >
      {children}
    </span>
  );
}

export function buildReviewSlides({
  title,
  bookRef,
  review,
  discussion,
}: {
  title: string;
  bookRef: string;
  review: ReviewDeck | null;
  discussion: DiscussionQuestion | null;
}): ReactNode[] {
  const slides: ReactNode[] = [
    <DarkSlide key="title">
      <p {...fade(0, "text-sm font-semibold tracking-[0.35em] text-white/60")}>🔁 חזרה — חמש דקות</p>
      <Motif delay={0.15} />
      <h1 {...fade(0.3, "font-display text-5xl font-extrabold leading-tight sm:text-6xl")}>{title}</h1>
      <p className="deck-fade text-lg" style={{ animationDelay: "0.6s", color: "#e0a47a" }}>
        📖 {bookRef}
      </p>
    </DarkSlide>,
  ];
  const points = review?.points ?? [];
  points.forEach((pt, i) => {
    slides.push(
      <LightSlide key={`p${i}`} watermark={String(i + 1)}>
        <Chip delay={0.1}>
          {i + 1} / {points.length}
        </Chip>
        <p
          className="deck-fade max-w-4xl font-display text-4xl font-extrabold leading-snug sm:text-5xl"
          style={{ color: GRAPE, animationDelay: "0.35s" }}
        >
          {pt}
        </p>
        <Motif delay={0.7} />
      </LightSlide>
    );
  });
  if (review?.skill) {
    slides.push(
      <LightSlide key="skill">
        <p className="deck-fade text-sm font-semibold tracking-[0.35em]" style={{ color: COPPER }}>
          המיומנות שתרגלנו
        </p>
        <p {...fade(0.3, "max-w-4xl text-3xl leading-relaxed sm:text-4xl")}>{review.skill}</p>
      </LightSlide>
    );
  }
  if (discussion?.question) {
    slides.push(
      <DarkSlide key="discussion">
        <Chip delay={0.1}>
          <span className="deck-bounce">💬</span> עכשיו — לדיון
        </Chip>
        <p {...fade(0.4, "max-w-4xl font-display text-4xl font-extrabold leading-snug sm:text-5xl")}>
          {discussion.question}
        </p>
        <p {...fade(0.9, "text-lg text-white/60")}>מי שסיים/ה את היחידה — הבמה שלכם.</p>
      </DarkSlide>
    );
  }
  return slides;
}

export default function ReviewDeckPlayer({
  taskId,
  contentRef,
  title,
  bookRef,
  review,
  discussion,
}: {
  taskId: number;
  contentRef: string;
  title: string;
  bookRef: string;
  review: ReviewDeck | null;
  discussion: DiscussionQuestion | null;
}) {
  const slides = buildReviewSlides({ title, bookRef, review, discussion });
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const count = slides.length;
  const backHref = `/dashboard/task/${taskId}`;

  const go = useCallback((n: number) => setIdx(Math.max(0, Math.min(count - 1, n))), [count]);

  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === " " || e.key === "Enter" || e.key === "PageDown") {
        e.preventDefault();
        setIdx((i) => Math.min(count - 1, i + 1));
      } else if (e.key === "ArrowRight" || e.key === "PageUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") setIdx(0);
      else if (e.key === "End") setIdx(count - 1);
      else if (e.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else window.location.href = backHref;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, editing, backHref]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  return (
    <div ref={rootRef} dir="rtl" className="fixed inset-0 z-[70] flex flex-col overflow-hidden" style={{ background: "#fbf6f1" }}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2 backdrop-blur" style={{ borderColor: "#e9ddd2", background: "rgba(255,253,250,0.85)" }}>
        <div className="flex items-center gap-3">
          <a href={backHref} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "#e9ddd2", color: GRAPE }}>
            → יציאה מהמצגת
          </a>
          <span className="hidden text-sm font-semibold sm:inline" style={{ color: GRAPE }}>
            חזרה · {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-dashed px-3 py-1 text-xs font-bold"
            style={{ borderColor: `${GRAPE}66`, color: GRAPE }}
          >
            ✏️ {editing ? "סגירת העריכה" : "עריכת הנקודות"}
          </button>
          <span className="text-xs tabular-nums" style={{ color: `${GRAPE}99` }}>
            {idx + 1} / {count}
          </span>
          <button type="button" onClick={toggleFullscreen} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "#e9ddd2", color: GRAPE }}>
            ⛶ מסך מלא
          </button>
        </div>
      </div>

      {editing ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl">
            <p className="mb-3 text-xs" style={{ color: `${GRAPE}99` }}>
              השקף הראשון (כותרת ופרק) נלקח מהיחידה. כאן עורכים את כל השאר — נקודות החזרה, המיומנות
              ושאלת הדיון שסוגרת את המצגת — ידנית, או בבקשה מקלוד.
            </p>
            <ReviewEditor
              contentRef={contentRef}
              initial={review}
              initialDiscussion={discussion}
              onClose={() => setEditing(false)}
            />
          </div>
        </div>
      ) : (
        <div
          className="relative flex-1 cursor-pointer select-none overflow-hidden"
          onClick={() => go(idx + 1)}
          onPointerDown={(e) => {
            touchStart.current = e.clientX;
          }}
          onPointerUp={(e) => {
            const s = touchStart.current;
            touchStart.current = null;
            if (s == null) return;
            const dx = e.clientX - s;
            if (Math.abs(dx) > 60) go(dx > 0 ? idx + 1 : idx - 1);
          }}
        >
          <div key={idx} className="absolute inset-0 overflow-y-auto">
            {slides[idx]}
          </div>
          {idx > 0 && (
            <button type="button" aria-label="השקף הקודם" onClick={(e) => { e.stopPropagation(); go(idx - 1); }} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full border bg-white/90 px-3 py-2 text-lg shadow-sm transition hover:scale-110" style={{ borderColor: "#e9ddd2", color: GRAPE }}>
              ‹
            </button>
          )}
          {idx < count - 1 && (
            <button type="button" aria-label="השקף הבא" onClick={(e) => { e.stopPropagation(); go(idx + 1); }} className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full border bg-white/90 px-3 py-2 text-lg shadow-sm transition hover:scale-110" style={{ borderColor: "#e9ddd2", color: GRAPE }}>
              ›
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 border-t px-4 py-2.5" style={{ borderColor: "#e9ddd2", background: "rgba(255,253,250,0.85)" }}>
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`מעבר לשקף ${i + 1}`}
            onClick={() => go(i)}
            className="rounded-full transition-all"
            style={{ width: i === idx ? 22 : 8, height: 8, background: i === idx ? GRAPE : i < idx ? COPPER : "#e9ddd2" }}
          />
        ))}
      </div>
    </div>
  );
}
