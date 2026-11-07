"use client";

import { useEffect, useRef, useState } from "react";
import { CLAUSE_STATUS_META, type PublicClause } from "@/lib/amana-shared";

// The charter on the projector: big type, the whole scroll. Polls every few
// seconds; a clause that was not there when the board opened is typed onto
// the screen letter by letter, so the class sees the moment it is written.
// No teacher input here (Rafael's rule) — the teacher adds clauses from
// /dashboard/amana or the chat.
const POLL_MS = 4000;
const TYPE_MS = 45;

function Typed({ text, onDone }: { text: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (n >= text.length) {
      if (!done.current) {
        done.current = true;
        onDone();
      }
      return;
    }
    const t = window.setTimeout(() => setN((x) => x + 1), TYPE_MS);
    return () => window.clearTimeout(t);
  }, [n, text, onDone]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="amana-caret mr-0.5 inline-block w-[3px] translate-y-1 bg-[#b96a3b]" style={{ height: "1em" }} aria-hidden />}
    </>
  );
}

export default function AmanaBoard({ initial }: { initial: PublicClause[] }) {
  const [clauses, setClauses] = useState(initial);
  const known = useRef(new Set(initial.map((c) => c.id)));
  const [typing, setTyping] = useState<Set<number>>(new Set());
  const [typed, setTyped] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/amana", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { clauses: PublicClause[] };
        if (!alive) return;
        const fresh = data.clauses.filter((c) => !known.current.has(c.id));
        for (const c of fresh) known.current.add(c.id);
        if (fresh.length) setTyping((s) => new Set([...s, ...fresh.map((c) => c.id)]));
        setClauses(data.clauses);
      } catch {
        /* next round */
      }
    };
    const t = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  // keep the clause being written in view
  useEffect(() => {
    if (!typing.size) return;
    const id = [...typing].pop();
    document.getElementById(`board-clause-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [typing]);

  const approved = clauses.filter((c) => c.status === "approved").length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" dir="rtl" style={{ background: "radial-gradient(ellipse at top, #3b2b4f 0%, #241a31 70%)" }}>
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12">
        <div className="rounded-[2rem] border-[6px] border-double border-[#c79a6b] px-8 py-10 shadow-2xl sm:px-16" style={{ background: "linear-gradient(180deg, #fdf3e1 0%, #fffaf0 15%, #fffaf0 85%, #fbefd9 100%)" }}>
          <header className="text-center">
            <p className="text-5xl" aria-hidden>📜</p>
            <h1 className="font-display text-5xl font-extrabold text-[#413055] sm:text-6xl">אמנת הכיתה — קדושים תהיו</h1>
            <p className="mt-3 text-2xl font-bold text-[#b96a3b]">
              {clauses.length} {clauses.length === 1 ? "סעיף" : "סעיפים"}{approved ? ` · ${approved} אושרו` : ""}
            </p>
          </header>
          <ol ref={listRef} className="mt-8">
            {clauses.map((c) => {
              const isTyping = typing.has(c.id) && !typed.has(c.id);
              const meta = CLAUSE_STATUS_META[c.status];
              return (
                <li id={`board-clause-${c.id}`} key={c.id} className={`flex gap-6 border-b-2 border-dashed border-[#d9c3a5] py-7 last:border-b-0 ${typing.has(c.id) ? "amana-in" : ""}`}>
                  <span className="mt-1 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-[#b96a3b] font-display text-3xl font-extrabold text-[#b96a3b]">
                    {c.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-4xl font-bold leading-snug text-[#413055]">
                      {isTyping ? <Typed text={c.text} onDone={() => setTyped((s) => new Set([...s, c.id]))} /> : c.text}
                    </p>
                    {!isTyping && (c.verseQuote || c.verseSource) && (
                      <p className={`mt-3 text-2xl text-[#2e2438]/80 ${typing.has(c.id) ? "save-fade" : ""}`}>
                        {c.verseQuote && <span className="font-mikra text-3xl">״{c.verseQuote}״</span>}
                        {c.verseSource && <span className="mr-3 text-xl font-bold text-[#b96a3b]">({c.verseSource})</span>}
                      </p>
                    )}
                    {!isTyping && (
                      <span className="mt-3 inline-block rounded-full px-4 py-1 text-lg font-bold" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {clauses.length === 0 && <p className="mt-10 text-center text-3xl text-[#2e2438]/50">הסעיף הראשון עוד ייכתב כאן…</p>}
        </div>
      </div>
    </div>
  );
}
