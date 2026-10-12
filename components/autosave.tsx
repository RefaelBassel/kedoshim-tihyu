"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Autosave for the teacher's editors (the exam, the exam prep): every change
// is saved by itself a moment after she stops typing. The status pill always
// says where things stand — waiting, saving, saved, or not saved (with a
// retry) — and leaving the page with unsaved changes asks first.
export type AutosaveState = "saved" | "pending" | "saving" | "error";

export function useAutosave<T>(value: T, save: (v: T) => Promise<void>, delay = 1200) {
  const [state, setState] = useState<AutosaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const baseline = useRef(JSON.stringify(value));
  const latest = useRef(value);
  const saveRef = useRef(save);
  const timer = useRef<number | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const run = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (running.current) {
      again.current = true;
      return;
    }
    const snapshot = latest.current;
    const json = JSON.stringify(snapshot);
    if (json === baseline.current) {
      setState("saved");
      return;
    }
    running.current = true;
    setState("saving");
    setError(null);
    try {
      await saveRef.current(snapshot);
      baseline.current = json;
      setState(JSON.stringify(latest.current) === json ? "saved" : "pending");
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא נשמר");
      setState("error");
    } finally {
      running.current = false;
    }
    if (again.current || JSON.stringify(latest.current) !== baseline.current) {
      again.current = false;
      if (JSON.stringify(latest.current) !== baseline.current) timer.current = window.setTimeout(run, delay);
    }
  }, [delay]);

  useEffect(() => {
    latest.current = value;
    const json = JSON.stringify(value);
    if (json === baseline.current) return;
    setState((s) => (s === "saving" ? s : "pending"));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(run, delay);
  }, [value, delay, run]);

  useEffect(() => {
    if (state === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  // a new value that is already saved (e.g. Claude rewrote it on the server)
  const reset = useCallback((v: T) => {
    if (timer.current) window.clearTimeout(timer.current);
    latest.current = v;
    baseline.current = JSON.stringify(v);
    setState("saved");
    setError(null);
  }, []);

  return { state, error, flush: run, reset };
}

export function AutosaveStatus({ state, error, onRetry }: { state: AutosaveState; error: string | null; onRetry: () => void }) {
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--danger)]/10 px-3 py-1 text-xs font-bold text-[color:var(--danger)]" aria-live="polite">
        ⚠ לא נשמר{error ? ` — ${error}` : ""}
        <button type="button" onClick={onRetry} className="rounded-full bg-[color:var(--danger)] px-2.5 py-0.5 text-[11px] text-white transition hover:scale-[1.04] active:scale-95">
          לנסות שוב
        </button>
      </span>
    );
  }
  const look: Record<Exclude<AutosaveState, "error">, { cls: string; text: string }> = {
    saved: { cls: "bg-[color:var(--success)]/12 text-[color:var(--success)]", text: "✓ כל השינויים נשמרו" },
    pending: { cls: "bg-[color:var(--warning)]/12 text-[color:var(--warning)]", text: "● שינויים — נשמרים מיד" },
    saving: { cls: "bg-[color:var(--accent)]/12 text-[color:var(--accent)]", text: "שומר…" },
  };
  const l = look[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${l.cls}`} aria-live="polite">
      {state === "saving" && <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
      {l.text}
    </span>
  );
}
