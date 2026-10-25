"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AutosaveStatus, useAutosave } from "@/components/autosave";
import { formatHebDateTime } from "@/lib/hebrew";
import {
  studentAverage,
  taskFinal,
  type InterimGrades,
  type InterimSettings,
  type InterimStudent,
} from "@/lib/interim-grades-shared";

// The interim grade table (issue #17): one row per approved student, one
// column per task of the unit (Claude's lenient check, or the teacher's own
// grade ✋), and the proposed average. A click on a cell opens the answers
// with their grades and notes. Teacher only; nothing here reaches students
// unless she presses "פרסום ציונים".

const API = "/api/interim-grades";

async function post(body: Record<string, unknown>) {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "הפעולה נכשלה — נסי שוב");
  return j;
}

function scoreColor(v: number) {
  return v >= 85 ? "var(--success)" : v >= 60 ? "var(--warning)" : "var(--danger)";
}

type CheckState =
  | { phase: "idle" }
  | { phase: "running"; done: number; remaining: number }
  | { phase: "done"; done: number; failed: number }
  | { phase: "error"; error: string };

export default function InterimGradesView({ grades }: { grades: InterimGrades }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const [settings, setSettings] = useState<InterimSettings>(grades.settings);
  const [open, setOpen] = useState<{ userId: number; taskId: number } | null>(null);
  const [check, setCheck] = useState<CheckState>({ phase: "idle" });

  const saveSettings = useCallback(async (s: InterimSettings) => {
    await post({ action: "settings", ...s });
    refresh();
  }, [refresh]);
  const autosave = useAutosave(settings, saveSettings, 400);

  const runCheck = useCallback(async () => {
    let done = 0;
    let failed = 0;
    setCheck({ phase: "running", done: 0, remaining: grades.pending });
    try {
      for (;;) {
        const j = await post({ action: "check" });
        done += Number(j.checked ?? 0);
        failed = Number(j.failed ?? 0);
        const remaining = Number(j.remaining ?? 0);
        setCheck({ phase: "running", done, remaining });
        refresh();
        if (remaining === 0 || Number(j.checked ?? 0) === 0) break;
      }
      setCheck({ phase: "done", done, failed });
    } catch (e) {
      setCheck({ phase: "error", error: e instanceof Error ? e.message : "הבדיקה נכשלה" });
      refresh();
    }
  }, [grades.pending, refresh]);

  // the very first visit: nothing was ever checked → start by itself
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (grades.apiAvailable && grades.checked === 0 && grades.pending > 0) void runCheck();
  }, [grades.apiAvailable, grades.checked, grades.pending, runCheck]);

  const rows = useMemo(
    () => grades.students.map((s) => ({ s, avg: studentAverage(s, settings) })),
    [grades.students, settings]
  );
  const included = new Set(settings.include);

  const exportCsv = () => {
    const cell = (v: string | number | null) => {
      const t = v == null ? "" : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const head = ["שם", "כיתה", ...grades.tasks.map((t) => t.title), "ממוצע מוצע", "על בסיס משימות"];
    const lines = rows.map(({ s, avg }) => [
      s.name,
      s.klass ?? "",
      ...grades.tasks.map((t) => taskFinal(s.tasks[t.taskId])),
      avg.final,
      `${avg.basis} מתוך ${avg.of}`,
    ]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ציון-ביניים-פרק-טז.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openStudent = open ? grades.students.find((s) => s.userId === open.userId) ?? null : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* the check */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[color:var(--primary)]/80">
            <p>
              <b>{grades.checked}</b> תשובות נבדקו
              {grades.pending > 0 && (
                <>
                  {" "}· <b className="text-[color:var(--warning)]">{grades.pending}</b> תשובות חדשות או שהשתנו ממתינות לבדיקה
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-[color:var(--primary)]/60">
              בדיקה מקלה בעזרת קלוד: תשובה עם רעיון נכון מקבלת ציון מלא או כמעט מלא; 0 רק לתשובה ריקה, חסרת תוכן או סותרת את הפסוק.
              ציון משימה = ממוצע השאלות הגלויות בה.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={check.phase === "running" || !grades.apiAvailable}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white shadow transition ${
              check.phase === "running" ? "scale-[0.97] bg-[color:var(--accent)] opacity-90" : "bg-[color:var(--primary)] hover:scale-[1.02]"
            } disabled:cursor-not-allowed`}
          >
            {check.phase === "running" && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {check.phase === "running" ? "בודק…" : "🔍 בדיקה מחדש"}
          </button>
        </div>
        <div className="mt-2 text-xs font-bold" aria-live="polite">
          {!grades.apiAvailable && <span className="text-[color:var(--danger)]">מפתח ה-API של אנתרופיק לא הוגדר — אי אפשר לבדוק.</span>}
          {check.phase === "running" && (
            <span className="text-[color:var(--accent)]">
              נבדקו {check.done} · נותרו {check.remaining} — אפשר להמשיך לעבוד, הטבלה מתעדכנת
            </span>
          )}
          {check.phase === "done" && (
            <span className={check.failed ? "text-[color:var(--warning)]" : "text-[color:var(--success)]"}>
              {check.done === 0 && !check.failed ? "✓ אין תשובות חדשות לבדיקה" : `✓ נבדקו ${check.done} תשובות`}
              {check.failed > 0 && ` · ${check.failed} לא נבדקו — אפשר ללחוץ שוב`}
            </span>
          )}
          {check.phase === "error" && <span className="text-[color:var(--danger)]">⚠ {check.error}</span>}
        </div>
      </section>

      {/* how the average is computed */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[color:var(--primary)]">🧮 חישוב הממוצע</h2>
          <AutosaveStatus state={autosave.state} error={autosave.error} onRetry={() => void autosave.flush()} />
        </div>
        <p className="mb-2 text-xs font-bold text-[color:var(--primary)]/70">משימות שנכנסות לחישוב:</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {grades.tasks.map((t) => (
            <label
              key={t.taskId}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                included.has(t.taskId) ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 text-[color:var(--primary)]" : "border-[color:var(--border)] text-[color:var(--primary)]/50"
              }`}
            >
              <input
                type="checkbox"
                checked={included.has(t.taskId)}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    include: e.target.checked ? grades.tasks.map((x) => x.taskId).filter((id) => id === t.taskId || s.include.includes(id)) : s.include.filter((id) => id !== t.taskId),
                  }))
                }
              />
              {t.title}
            </label>
          ))}
        </div>
        <p className="mb-2 text-xs font-bold text-[color:var(--primary)]/70">משימה שהתלמיד לא עשה בכלל:</p>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {[
            { v: false, label: "לא נכנסת לממוצע" },
            { v: true, label: "נספרת כ-0" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={settings.missingAsZero === o.v}
              onClick={() => setSettings((s) => ({ ...s, missingAsZero: o.v }))}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                settings.missingAsZero === o.v ? "bg-[color:var(--primary)] text-white shadow" : "border border-[color:var(--border)] text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10"
              }`}
            >
              {settings.missingAsZero === o.v ? "● " : "○ "}
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* the table */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[color:var(--primary)]">
            👥 הציונים {refreshing && <span className="text-xs font-normal text-[color:var(--primary)]/50">· מתעדכן…</span>}
          </h2>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="rounded-full border-2 border-[color:var(--primary)]/40 px-4 py-1.5 text-sm font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 active:scale-95 disabled:opacity-40"
          >
            ⬇️ ייצוא ל-Excel/CSV
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/60">עוד אין תלמידים מאושרים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--border)] text-xs text-[color:var(--primary)]/70">
                <tr>
                  <th className="px-2 py-2 text-start">שם</th>
                  <th className="px-2 py-2 text-start">כיתה</th>
                  {grades.tasks.map((t) => (
                    <th key={t.taskId} className={`px-2 py-2 text-center ${included.has(t.taskId) ? "" : "opacity-40"}`} title={t.title}>
                      <span className="line-clamp-2 max-w-[8rem]">{t.title}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center">ממוצע מוצע</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, avg }) => (
                  <tr key={s.userId} className="border-b border-[color:var(--border)]/60 last:border-0">
                    <td className="px-2 py-2 font-semibold text-[color:var(--primary)]">{s.name}</td>
                    <td className="px-2 py-2">{s.klass ?? "—"}</td>
                    {grades.tasks.map((t) => {
                      const st = s.tasks[t.taskId];
                      const v = taskFinal(st);
                      return (
                        <td key={t.taskId} className={`px-1 py-1.5 text-center ${included.has(t.taskId) ? "" : "opacity-40"}`}>
                          <button
                            type="button"
                            onClick={() => setOpen({ userId: s.userId, taskId: t.taskId })}
                            className="min-w-[3.25rem] rounded-lg px-2 py-1 font-bold tabular-nums transition hover:bg-[color:var(--primary)]/10"
                            title={st?.override != null ? `ציון ידני${st.auto != null ? ` (ההצעה: ${st.auto})` : ""}` : "פירוט התשובות"}
                          >
                            {v == null ? (
                              st?.touched ? <span className="text-[color:var(--primary)]/50">⏳</span> : <span className="text-[color:var(--primary)]/40">—</span>
                            ) : (
                              <span style={{ color: scoreColor(v) }}>
                                {v}
                                {st?.override != null && <span className="ms-0.5 text-[10px]">✋</span>}
                                {st?.override == null && (st?.pending ?? 0) > 0 && <span className="ms-0.5 text-[10px]">⏳</span>}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => setOpen({ userId: s.userId, taskId: 0 })}
                        className="rounded-lg px-2 py-1 transition hover:bg-[color:var(--primary)]/10"
                        title={s.override != null ? `ציון ידני${avg.auto != null ? ` (הממוצע המחושב: ${avg.auto})` : ""}` : "דריסה ידנית של הציון"}
                      >
                        <span className="block font-display text-base font-extrabold tabular-nums" style={{ color: avg.final != null ? scoreColor(avg.final) : undefined }}>
                          {avg.final ?? "—"}
                          {s.override != null && <span className="ms-0.5 text-[11px]">✋</span>}
                        </span>
                        <span className="block whitespace-nowrap text-[10px] text-[color:var(--primary)]/55">
                          על בסיס {avg.basis} מתוך {avg.of} משימות
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-[color:var(--primary)]/60">
          לחיצה על ציון פותחת את התשובות, הציון וההערה לכל שאלה, ושם אפשר לדרוס ידנית · ✋ ציון ידני של המורה · ⏳ יש תשובות שעוד לא נבדקו · — התלמיד לא נגע במשימה
        </p>
      </section>

      <PublishPanel grades={grades} onDone={refresh} />

      {open && openStudent && (
        <DetailDrawer grades={grades} student={openStudent} taskId={open.taskId} settings={settings} onClose={() => setOpen(null)} onSaved={refresh} />
      )}
    </div>
  );
}

function DetailDrawer({
  grades,
  student,
  taskId,
  settings,
  onClose,
  onSaved,
}: {
  grades: InterimGrades;
  student: InterimStudent;
  taskId: number;
  settings: InterimSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const task = grades.tasks.find((t) => t.taskId === taskId) ?? null;
  const st = task ? student.tasks[task.taskId] : undefined;
  const avg = studentAverage(student, settings);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto bg-[color:var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">{student.name}</p>
            <p className="text-sm text-[color:var(--primary)]/70">{task ? task.title : "הציון של כל הפרק"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-sm font-bold text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10">
            ✕ סגירה
          </button>
        </div>

        {task ? (
          <>
            <p className="mb-3 text-sm">
              ההצעה של הבדיקה: <b className="tabular-nums">{st?.auto ?? "—"}</b>
              {st && !st.touched && " · התלמיד לא נגע במשימה"}
              {(st?.pending ?? 0) > 0 && ` · ${st?.pending} תשובות ממתינות לבדיקה`}
            </p>
            <OverrideEditor key={`${student.userId}:${task.taskId}`} userId={student.userId} taskId={task.taskId} current={st?.override ?? null} onSaved={onSaved} />
            <ol className="mt-5 space-y-3">
              {(st?.questions ?? []).map((q, i) => (
                <li key={q.key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3 text-sm">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-[color:var(--primary)]/70">
                      {i + 1}. {q.label}
                    </p>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums text-white"
                      style={{ background: q.score == null ? "#a99d91" : scoreColor(q.score) }}
                    >
                      {q.score == null ? "⏳" : q.score}
                    </span>
                  </div>
                  <p className="mb-2 text-xs leading-5 text-[color:var(--foreground)]/70">{q.prompt}</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-[color:var(--background)] px-3 py-2 leading-6">
                    {q.answer || <span className="text-[color:var(--primary)]/40">(לא נענתה)</span>}
                  </p>
                  <p className="mt-1.5 text-xs text-[color:var(--accent)]">💬 {q.note ?? "ממתינה לבדיקה"}</p>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm">
              הממוצע המחושב: <b className="tabular-nums">{avg.auto ?? "—"}</b> · על בסיס {avg.basis} מתוך {avg.of} משימות
            </p>
            <OverrideEditor key={`${student.userId}:0`} userId={student.userId} taskId={0} current={student.override} onSaved={onSaved} />
            <ul className="mt-5 space-y-1.5 text-sm">
              {grades.tasks.map((t) => {
                const v = taskFinal(student.tasks[t.taskId]);
                return (
                  <li key={t.taskId} className={`flex justify-between gap-2 rounded-lg bg-[color:var(--card)] px-3 py-2 ${settings.include.includes(t.taskId) ? "" : "opacity-40"}`}>
                    <span>{t.title}</span>
                    <b className="tabular-nums">
                      {v ?? "—"}
                      {student.tasks[t.taskId]?.override != null && " ✋"}
                    </b>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

function OverrideEditor({ userId, taskId, current, onSaved }: { userId: number; taskId: number; current: number | null; onSaved: () => void }) {
  const [value, setValue] = useState(current == null ? "" : String(current));
  const [phase, setPhase] = useState<"idle" | "saving" | "saved" | "cleared" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
  const dirty = valid && (current == null || Math.round(n) !== current);

  const save = async (score: number | null) => {
    setPhase("saving");
    setError(null);
    try {
      await post({ action: "override", userId, taskId, score });
      setPhase(score == null ? "cleared" : "saved");
      if (score == null) setValue("");
      onSaved();
      window.setTimeout(() => setPhase("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא נשמר");
      setPhase("error");
    }
  };

  return (
    <div className="rounded-xl border-2 border-[color:var(--accent)]/40 bg-[color:var(--card)] p-3">
      <p className="mb-2 text-xs font-bold text-[color:var(--primary)]/80">
        ✋ ציון ידני {current != null ? <span className="text-[color:var(--accent)]">· שמור: {current}</span> : "· לא נקבע (מוצגת ההצעה)"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24 rounded-lg border border-[color:var(--border)] bg-white px-3 py-1.5 text-center tabular-nums"
          aria-label="ציון ידני"
        />
        <button
          type="button"
          onClick={() => void save(Math.round(n))}
          disabled={!dirty || phase === "saving"}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold transition ${
            phase === "saved" ? "bg-[color:var(--success)] text-white" : dirty ? "bg-[color:var(--accent)] text-white shadow hover:scale-[1.03]" : "border border-[color:var(--border)] text-[color:var(--primary)]/40"
          } ${phase === "saving" ? "scale-[0.96] opacity-90" : ""}`}
        >
          {phase === "saving" && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {phase === "saving" ? "שומר…" : phase === "saved" ? "✓ נשמר!" : dirty ? "שמירת הציון" : "אין שינוי"}
        </button>
        {current != null && (
          <button
            type="button"
            onClick={() => void save(null)}
            disabled={phase === "saving"}
            className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10"
          >
            ↩ חזרה להצעה
          </button>
        )}
        {phase === "cleared" && <span className="text-xs font-bold text-[color:var(--success)]">✓ הדריסה בוטלה</span>}
        {phase === "error" && error && <span className="text-xs font-bold text-[color:var(--danger)]">⚠ {error}</span>}
        {value.trim() !== "" && !valid && <span className="text-xs font-bold text-[color:var(--warning)]">ציון בין 0 ל-100</span>}
      </div>
    </div>
  );
}

function PublishPanel({ grades, onDone }: { grades: InterimGrades; onDone: () => void }) {
  const [phase, setPhase] = useState<"idle" | "publishing" | "unpublishing" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const published = grades.publishedAt != null;

  const act = async (action: "publish" | "unpublish") => {
    const question =
      action === "publish"
        ? `לפרסם לתלמידים את ציוני המשימות שנכנסות לחישוב?${grades.pending > 0 ? `\n\nשימי לב: ${grades.pending} תשובות עוד לא נבדקו.` : ""}\n\nכל תלמיד יראה ליד כל משימה את הציון שלה (כולל ציונים ידניים), ויקבל התראה באתר. אפשר לבטל את הפרסום אחר כך.`
        : "לבטל את הפרסום? הציונים של התלמידים יחזרו למה שהיה לפני הפרסום.";
    if (!window.confirm(question)) return;
    setPhase(action === "publish" ? "publishing" : "unpublishing");
    setMsg(null);
    try {
      const j = await post({ action });
      setMsg(action === "publish" ? `✓ פורסמו ${j.count} ציונים` : `✓ הפרסום בוטל (${j.count} ציונים שוחזרו)`);
      setPhase("done");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "הפעולה נכשלה");
      setPhase("error");
    }
  };
  const busy = phase === "publishing" || phase === "unpublishing";

  return (
    <section className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--primary)]">📢 פרסום ציונים לתלמידים</h2>
      <p className="mb-3 text-xs text-[color:var(--primary)]/65">
        {published ? (
          <>
            <b className="text-[color:var(--success)]">פורסם · {formatHebDateTime(grades.publishedAt!)}</b> — התלמידים רואים את ציון כל משימה שנכנסת לחישוב.
            {grades.publishedStale > 0 && <b className="text-[color:var(--warning)]"> {grades.publishedStale} ציונים השתנו מאז הפרסום — אפשר לפרסם שוב.</b>}
          </>
        ) : (
          <>כבוי — התלמידים לא רואים כלום מהעמוד הזה. רק לחיצה כאן כותבת את ציון כל משימה להגשה של התלמיד, כך שיופיע לו.</>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void act("publish")}
          disabled={busy}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white shadow transition ${
            phase === "publishing" ? "scale-[0.96] bg-[color:var(--accent)] opacity-90" : "bg-[color:var(--accent)] hover:scale-[1.02]"
          } disabled:cursor-not-allowed`}
        >
          {phase === "publishing" && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {phase === "publishing" ? "מפרסם…" : published ? "📢 פרסום מחדש" : "📢 פרסום ציונים"}
        </button>
        {published && (
          <button
            type="button"
            onClick={() => void act("unpublish")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--danger)]/50 px-4 py-1.5 text-sm font-bold text-[color:var(--danger)] transition hover:bg-[color:var(--danger)]/10 disabled:opacity-50"
          >
            {phase === "unpublishing" && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
            {phase === "unpublishing" ? "מבטל…" : "ביטול הפרסום"}
          </button>
        )}
        {msg && (
          <span className={`text-xs font-bold ${phase === "error" ? "text-[color:var(--danger)]" : "text-[color:var(--success)]"}`} aria-live="polite">
            {phase === "error" ? `⚠ ${msg}` : msg}
          </span>
        )}
      </div>
    </section>
  );
}
