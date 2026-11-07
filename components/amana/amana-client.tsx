"use client";

import { useEffect, useState } from "react";
import type { PublicUnitProposals } from "@/lib/amana";

// Tells the server the viewer has seen every clause so far, once the page
// is on screen (so a prefetch never clears the "חדש!" badges).
export function MarkSeen() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetch("/api/amana/seen", { method: "POST" }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

// "הצעות לסעיף הבא": the proposals the teacher chose to show, with 👍 — one
// per unit; tapping the same one again takes the vote back.
export function ProposalsBoard({ initial, canVote }: { initial: PublicUnitProposals[]; canVote: boolean }) {
  const [units, setUnits] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vote = async (ref: string, proposalId: number) => {
    if (!canVote || busy != null) return;
    setBusy(proposalId);
    setError(null);
    try {
      const res = await fetch("/api/amana/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "לא נשמר");
      const myVote: number | null = data.myVote;
      setUnits((us) =>
        us.map((u) => {
          if (u.ref !== ref) return u;
          return {
            ...u,
            myVote,
            proposals: u.proposals.map((p) => {
              let votes = p.votes;
              if (p.id === u.myVote) votes -= 1;
              if (p.id === myVote) votes += 1;
              return { ...p, votes: Math.max(0, votes) };
            }),
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא נשמר — נסו שוב");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-[color:var(--danger)]/10 px-3 py-2 text-sm font-bold text-[color:var(--danger)]">{error}</p>}
      {units.map((u) => (
        <div key={u.ref} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
          <p className="text-[11px] font-bold text-[color:var(--accent)]">{u.unit}</p>
          <h3 className="font-display text-base font-bold text-[color:var(--primary)]">{u.title}</h3>
          {canVote && (
            <p className="mt-0.5 text-xs text-[color:var(--foreground)]/55">
              {u.myVote ? "נתת 👍 — אפשר להעביר אותו להצעה אחרת או לבטל בלחיצה נוספת." : "אפשר לתת 👍 להצעה אחת ביחידה."}
            </p>
          )}
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {u.proposals.map((p) => {
              const mineVote = u.myVote === p.id;
              return (
                <li
                  key={p.id}
                  className={`flex flex-col justify-between gap-2 rounded-xl border-2 p-3 transition ${mineVote ? "border-[color:var(--accent)] bg-[color:var(--accent)]/5" : "border-[color:var(--border)] bg-[#fffaf0]"}`}
                >
                  <p className="text-sm leading-6 text-[color:var(--foreground)]">״{p.text}״</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[color:var(--foreground)]/50">
                      {p.mine ? "✏️ ההצעה שלך" : p.name ?? ""}
                    </span>
                    <button
                      type="button"
                      disabled={!canVote || busy != null}
                      onClick={() => vote(u.ref, p.id)}
                      aria-pressed={mineVote}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold transition active:scale-95 disabled:cursor-default ${mineVote ? "bg-[color:var(--accent)] text-white" : "border border-[color:var(--border)] bg-white text-[color:var(--primary)] hover:border-[color:var(--accent)]"} ${busy === p.id ? "animate-pulse" : ""}`}
                    >
                      {busy === p.id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden /> : "👍"}
                      <span>{p.votes}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
