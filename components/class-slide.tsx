"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import SaveButton from "./save-button";
import { SLIDE_BLOCK_ICON, SLIDE_BLOCK_KEYS, type SlideBlockKey, type SlideDoc } from "@/lib/class-slide-shared";

// שקופית כללי השיעור — one full-screen slide, readable from the back of the
// class: the title, three blocks side by side (stacked when narrow), a small
// closing line. Sizes follow the viewport so a 1920×1080 projector shows it
// all without scrolling. The faint corner controls (exit, fullscreen, edit)
// exist only here — the page is teacher-only. Editing opens a side drawer;
// the slide behind it previews the draft live.

const INK = "#2e2438";
const GRAPE = "#413055";
const COPPER = "#b96a3b";
const GREEN = "#3e6b4f";

const BLOCK_LOOK: Record<SlideBlockKey, { color: string; filled: boolean }> = {
  task: { color: GRAPE, filled: false },
  rules: { color: COPPER, filled: false },
  done: { color: GREEN, filled: true },
};

const size = {
  title: { fontSize: "clamp(2rem, min(7vh, 4vw), 6rem)" },
  heading: { fontSize: "clamp(1.5rem, min(4.6vh, 2.5vw), 4rem)" },
  line: { fontSize: "clamp(1.15rem, min(3.3vh, 1.75vw), 3rem)" },
  footer: { fontSize: "clamp(1rem, min(2.8vh, 1.5vw), 2.4rem)" },
} satisfies Record<string, CSSProperties>;

export default function ClassSlide({ initial }: { initial: SlideDoc }) {
  const [saved, setSaved] = useState<SlideDoc>(initial);
  const [draft, setDraft] = useState<SlideDoc | null>(null);
  const [isFull, setIsFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const editing = draft != null;
  const shown = draft ?? saved;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      // F11 would fullscreen the browser window; the slide itself is cleaner
      if (e.key === "F11" || e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const close = () => {
    if (dirty && !window.confirm("יש שינויים שלא נשמרו. לסגור בלי לשמור?")) return;
    setDraft(null);
  };

  const save = async () => {
    if (!draft) return;
    const res = await fetch("/api/class-slide", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slide: draft }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error ?? "לא נשמר — נסו שוב");
    setSaved(data.slide);
    setDraft(data.slide);
  };

  const setBlock = (k: SlideBlockKey, patch: Partial<SlideDoc["blocks"][SlideBlockKey]>) =>
    setDraft((d) => (d ? { ...d, blocks: { ...d.blocks, [k]: { ...d.blocks[k], ...patch } } } : d));

  const pill =
    "rounded-full border border-[color:var(--border)] bg-[color:var(--card)]/90 px-3 py-1 text-xs font-semibold text-[color:var(--primary)] shadow-sm transition hover:border-[color:var(--primary)]";

  return (
    <div
      ref={rootRef}
      dir="rtl"
      className="fixed inset-0 z-[70] flex overflow-hidden"
      style={{ background: "radial-gradient(1200px 700px at 50% 0%, #fffdfa 0%, #fbf6f1 55%, #f1e7dc 100%)", color: INK }}
    >
      {/* the slide */}
      <div className="relative flex-1 overflow-y-auto" onDoubleClick={editing ? undefined : toggleFullscreen}>
        <div className="flex min-h-full flex-col justify-center gap-[4vh] px-[4vw] py-[5vh]">
          <h1 className="deck-fade text-center font-display font-extrabold leading-tight" style={{ ...size.title, color: GRAPE }}>
            {shown.title}
          </h1>

          <div className="flex flex-col items-stretch gap-[2.5vw] lg:flex-row">
            {SLIDE_BLOCK_KEYS.map((k, i) => {
              const b = shown.blocks[k];
              const look = BLOCK_LOOK[k];
              return (
                <section
                  key={k}
                  className="deck-fade flex flex-1 flex-col gap-[2vh] rounded-3xl border-[3px] px-[2vw] py-[3vh] shadow-md"
                  style={{
                    animationDelay: `${0.15 + i * 0.15}s`,
                    borderColor: look.color,
                    background: look.filled ? look.color : "#fffdfa",
                    color: look.filled ? "#ffffff" : INK,
                  }}
                >
                  <h2 className="flex items-center gap-3 font-display font-extrabold leading-tight" style={{ ...size.heading, color: look.filled ? "#ffffff" : look.color }}>
                    <span aria-hidden>{SLIDE_BLOCK_ICON[k]}</span>
                    <span>{b.heading}</span>
                  </h2>
                  <ul className="flex flex-col gap-[1.6vh]">
                    {b.lines.map((line, j) => (
                      <li key={j} className="flex items-start gap-3 font-semibold leading-snug" style={size.line}>
                        <span
                          aria-hidden
                          className="mt-[0.45em] h-[0.45em] w-[0.45em] shrink-0 rounded-full"
                          style={{ background: look.filled ? "#ffffff" : look.color }}
                        />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          {shown.footer && (
            <p className="deck-fade text-center font-semibold" style={{ ...size.footer, animationDelay: "0.7s", color: `${INK}99` }}>
              {shown.footer}
            </p>
          )}
        </div>

        {/* teacher controls — faint so the projected slide stays clean */}
        {!editing && (
          <div className="absolute end-3 top-3 flex items-center gap-2 opacity-40 transition hover:opacity-100 focus-within:opacity-100">
            <a href="/dashboard/lesson" className={pill}>
              → יציאה
            </a>
            <button type="button" onClick={toggleFullscreen} className={pill}>
              {isFull ? "⛶ יציאה ממסך מלא" : "⛶ מסך מלא"}
            </button>
            <button type="button" onClick={() => setDraft(saved)} className={pill}>
              ✏️ עריכה
            </button>
          </div>
        )}
      </div>

      {/* the editor drawer — the slide beside it shows the draft live */}
      {editing && draft && (
        <aside className="flex w-full max-w-md shrink-0 flex-col border-s border-[color:var(--border)] bg-[color:var(--card)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
            <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">✏️ עריכת השקופית</p>
            <button type="button" onClick={close} className={pill}>
              ✕ סגירה
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
            <label className="block">
              <span className="mb-1 block font-bold text-[color:var(--primary)]">כותרת ראשית</span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2"
              />
            </label>

            {SLIDE_BLOCK_KEYS.map((k) => {
              const b = draft.blocks[k];
              return (
                <fieldset key={k} className="rounded-xl border-2 p-3" style={{ borderColor: `${BLOCK_LOOK[k].color}66` }}>
                  <label className="block">
                    <span className="mb-1 block font-bold" style={{ color: BLOCK_LOOK[k].color }}>
                      {SLIDE_BLOCK_ICON[k]} כותרת הבלוק
                    </span>
                    <input
                      value={b.heading}
                      onChange={(e) => setBlock(k, { heading: e.target.value })}
                      className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 font-bold"
                    />
                  </label>
                  <div className="mt-3 space-y-2">
                    {b.lines.map((line, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <textarea
                          value={line}
                          rows={2}
                          onChange={(e) => setBlock(k, { lines: b.lines.map((l, x) => (x === j ? e.target.value : l)) })}
                          className="flex-1 resize-y rounded-lg border border-[color:var(--border)] bg-white px-3 py-2"
                        />
                        <button
                          type="button"
                          aria-label="מחיקת השורה"
                          title="מחיקת השורה"
                          onClick={() => setBlock(k, { lines: b.lines.filter((_, x) => x !== j) })}
                          className="rounded-full border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--danger)] transition hover:border-[color:var(--danger)]"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {b.lines.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setBlock(k, { lines: [...b.lines, ""] })}
                        className="rounded-full border border-dashed px-3 py-1 text-xs font-bold transition hover:bg-black/5"
                        style={{ borderColor: BLOCK_LOOK[k].color, color: BLOCK_LOOK[k].color }}
                      >
                        + הוספת שורה
                      </button>
                    )}
                  </div>
                </fieldset>
              );
            })}

            <label className="block">
              <span className="mb-1 block font-bold text-[color:var(--primary)]">שורת סיום בתחתית</span>
              <input
                value={draft.footer}
                onChange={(e) => setDraft({ ...draft, footer: e.target.value })}
                className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2"
              />
            </label>
            <p className="text-xs text-[color:var(--foreground)]/60">
              שורות ריקות לא נשמרות. אפשר גם לבקש מקלוד בצ׳אט לעדכן את השקופית.
            </p>
          </div>

          <div className="border-t border-[color:var(--border)] px-4 py-3">
            <SaveButton dirty={dirty} onSave={save} savedNote="השקופית נשמרה" />
          </div>
        </aside>
      )}
    </div>
  );
}
