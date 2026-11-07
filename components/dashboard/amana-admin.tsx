"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SaveButton from "@/components/save-button";
import {
  CLAUSE_STATUSES,
  CLAUSE_STATUS_META,
  formatClauseDate,
  type Clause,
  type ClauseInput,
  type ClauseStatus,
} from "@/lib/amana-shared";
import type { TeacherProposal, UnitProposals } from "@/lib/amana";

// /dashboard/amana — the teacher's charter desk: every clause (edit, add,
// delete, reorder, status, notes from the meeting with the management) and,
// per unit, every proposal the students wrote in the charter questions,
// with "הצג לכיתה" and "הפוך לסעיף".

type UnitOption = { ref: string; label: string };
type Phase = "idle" | "working" | "done" | "error";

async function api<T = { clauses: Clause[] }>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "לא נשמר — נסו שוב");
  return data as T;
}

// a button that shows its state: working (spinner) → done (✓) / error
function ActionButton({
  onClick,
  children,
  doneLabel = "✓",
  className = "",
  disabled = false,
  title,
}: {
  onClick: () => Promise<void>;
  children: React.ReactNode;
  doneLabel?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const run = async () => {
    if (phase === "working") return;
    setPhase("working");
    try {
      await onClick();
      setPhase("done");
    } catch (e) {
      setPhase("error");
      window.alert(e instanceof Error ? e.message : "לא נשמר — נסו שוב");
    }
    timer.current = window.setTimeout(() => setPhase("idle"), 1400);
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || phase === "working"}
      onClick={run}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${phase === "done" ? "!bg-[color:var(--success)] !text-white !border-[color:var(--success)]" : phase === "error" ? "!bg-[color:var(--danger)] !text-white" : ""} ${className}`}
    >
      {phase === "working" && <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
      {phase === "done" ? doneLabel : children}
    </button>
  );
}

const EMPTY_DRAFT: ClauseInput = { text: "", verseQuote: "", verseSource: "", unitRef: null, status: "draft", teacherNote: "", adminNotes: "", proposedBy: "" };

function ClauseFields({
  value,
  onChange,
  units,
  full = true,
}: {
  value: ClauseInput;
  onChange: (v: ClauseInput) => void;
  units: UnitOption[];
  full?: boolean;
}) {
  const set = (patch: ClauseInput) => onChange({ ...value, ...patch });
  const input = "w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--accent)] focus:outline-none";
  const label = "block text-[11px] font-bold text-[color:var(--primary)]/60";
  return (
    <div className="grid gap-3">
      <div>
        <label className={label}>נוסח הסעיף (משפט אחד או שניים)</label>
        <textarea rows={2} className={input} value={value.text ?? ""} onChange={(e) => set({ text: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className={label}>הפסוק המבסס — ציטוט קצר</label>
          <input className={`${input} font-mikra text-base`} value={value.verseQuote ?? ""} onChange={(e) => set({ verseQuote: e.target.value })} />
        </div>
        <div>
          <label className={label}>המקור (למשל: ויקרא ה׳, כ״ג)</label>
          <input className={input} value={value.verseSource ?? ""} onChange={(e) => set({ verseSource: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>היחידה שממנה נולד</label>
          <select className={input} value={value.unitRef ?? ""} onChange={(e) => set({ unitRef: e.target.value || null })}>
            <option value="">— בלי יחידה —</option>
            {units.map((u) => (
              <option key={u.ref} value={u.ref}>{u.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>סטטוס</label>
          <select className={input} value={value.status ?? "draft"} onChange={(e) => set({ status: e.target.value as ClauseStatus })}>
            {CLAUSE_STATUSES.map((s) => (
              <option key={s} value={s}>{CLAUSE_STATUS_META[s].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>תאריך</label>
          <input type="date" className={input} value={value.clauseDate ?? ""} onChange={(e) => set({ clauseDate: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={label}>הוצע על ידי (לא חובה — מוצג לתלמידים רק אם ממולא)</label>
        <input className={input} value={value.proposedBy ?? ""} onChange={(e) => set({ proposedBy: e.target.value })} placeholder="למשל: נועה ל׳ ואיתי ש׳" />
      </div>
      <div>
        <label className={label}>הערת המורה (לא חובה — מוצגת לתלמידים מתחת לסעיף)</label>
        <textarea rows={2} className={input} value={value.teacherNote ?? ""} onChange={(e) => set({ teacherNote: e.target.value })} />
      </div>
      {full && (
        <div>
          <label className={label}>🏫 הערות מהפגישה עם ההנהלה (למורה בלבד)</label>
          <textarea rows={2} className={input} value={value.adminNotes ?? ""} onChange={(e) => set({ adminNotes: e.target.value })} />
        </div>
      )}
    </div>
  );
}

const fieldsOf = (c: Clause): ClauseInput => ({
  text: c.text,
  verseQuote: c.verseQuote,
  verseSource: c.verseSource,
  unitRef: c.unitRef,
  status: c.status,
  teacherNote: c.teacherNote,
  adminNotes: c.adminNotes,
  clauseDate: c.clauseDate,
  proposedBy: c.proposedBy,
});

function ClauseRow({
  clause,
  total,
  units,
  unitName,
  onClauses,
}: {
  clause: Clause;
  total: number;
  units: UnitOption[];
  unitName: string | null;
  onClauses: (c: Clause[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ClauseInput>(() => fieldsOf(clause));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusPhase, setStatusPhase] = useState<Phase>("idle");
  const original = useMemo(() => JSON.stringify(fieldsOf(clause)), [clause]);
  const dirty = JSON.stringify(draft) !== original;

  // a status changed from the row (or by another save) refreshes the draft
  useEffect(() => {
    if (!open) setDraft(fieldsOf(clause));
  }, [clause, open]);

  const changeStatus = async (status: ClauseStatus) => {
    setStatusPhase("working");
    try {
      const d = await api(`/api/amana/${clause.id}`, "PATCH", { clause: { status } });
      onClauses(d.clauses);
      setDraft((x) => ({ ...x, status }));
      setStatusPhase("done");
    } catch (e) {
      setStatusPhase("error");
      window.alert(e instanceof Error ? e.message : "לא נשמר");
    }
    window.setTimeout(() => setStatusPhase("idle"), 1400);
  };

  const meta = CLAUSE_STATUS_META[clause.status];
  return (
    <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ActionButton
            title="להזיז למעלה"
            disabled={clause.position <= 1}
            className="border border-[color:var(--border)] !px-2 text-[color:var(--primary)]"
            onClick={async () => onClauses((await api(`/api/amana/${clause.id}`, "PATCH", { move: clause.position - 1 })).clauses)}
          >
            ▲
          </ActionButton>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color:var(--accent)] font-display text-base font-extrabold text-[color:var(--accent)]">
            {clause.position}
          </span>
          <ActionButton
            title="להזיז למטה"
            disabled={clause.position >= total}
            className="border border-[color:var(--border)] !px-2 text-[color:var(--primary)]"
            onClick={async () => onClauses((await api(`/api/amana/${clause.id}`, "PATCH", { move: clause.position + 1 })).clauses)}
          >
            ▼
          </ActionButton>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="סטטוס הסעיף"
              value={clause.status}
              disabled={statusPhase === "working"}
              onChange={(e) => changeStatus(e.target.value as ClauseStatus)}
              className="rounded-full border-0 px-3 py-1 text-xs font-bold"
              style={{ background: meta.bg, color: meta.color }}
            >
              {CLAUSE_STATUSES.map((s) => (
                <option key={s} value={s}>{CLAUSE_STATUS_META[s].label}</option>
              ))}
            </select>
            {statusPhase === "working" && <span className="text-[11px] text-[color:var(--foreground)]/50">שומרים…</span>}
            {statusPhase === "done" && <span className="save-fade text-[11px] font-bold text-[color:var(--success)]">✓ נשמר</span>}
            {unitName && <span className="rounded-full border border-[color:var(--primary)]/20 px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--primary)]/70">📖 {unitName}</span>}
            <span className="text-[11px] text-[color:var(--foreground)]/45">{formatClauseDate(clause.clauseDate)}</span>
          </div>
          <p className="mt-1.5 font-display text-base font-bold leading-relaxed text-[color:var(--primary)]">{clause.text}</p>
          {(clause.verseQuote || clause.verseSource) && (
            <p className="text-sm text-[color:var(--foreground)]/75">
              {clause.verseQuote && <span className="font-mikra text-base">״{clause.verseQuote}״</span>} {clause.verseSource && <span className="text-xs font-bold text-[color:var(--accent)]">({clause.verseSource})</span>}
            </p>
          )}
          {clause.proposedBy && <p className="text-[11px] text-[color:var(--foreground)]/55">הוצע על ידי {clause.proposedBy}</p>}
          {clause.teacherNote && <p className="mt-1 text-xs text-[color:var(--foreground)]/65">✍️ {clause.teacherNote}</p>}
          {clause.adminNotes && (
            <p className="mt-1 rounded-lg bg-[#e3edf7] px-2.5 py-1.5 text-xs text-[#2f5d8a]">🏫 מהפגישה עם ההנהלה: {clause.adminNotes}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-full border border-[color:var(--primary)]/30 px-3 py-1 text-xs font-bold text-[color:var(--primary)] hover:border-[color:var(--accent)]"
            >
              {open ? "סגירת העריכה" : "✏️ עריכה והערות מההנהלה"}
            </button>
            {confirmDelete ? (
              <>
                <ActionButton
                  className="bg-[color:var(--danger)] text-white"
                  doneLabel="נמחק"
                  onClick={async () => onClauses((await api(`/api/amana/${clause.id}`, "DELETE")).clauses)}
                >
                  כן, למחוק את סעיף {clause.position}
                </ActionButton>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs font-bold text-[color:var(--foreground)]/60">ביטול</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-full px-3 py-1 text-xs font-bold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10">
                🗑️ מחיקה
              </button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div className="mt-4 border-t border-[color:var(--border)] pt-4">
          <ClauseFields value={draft} onChange={setDraft} units={units} />
          <SaveButton
            className="mt-3"
            dirty={dirty}
            savedNote="הסעיף עודכן באמנה"
            onSave={async () => {
              const d = await api(`/api/amana/${clause.id}`, "PATCH", { clause: draft });
              onClauses(d.clauses);
            }}
          />
        </div>
      )}
    </li>
  );
}

function ProposalRow({
  ref_,
  p,
  onChange,
  onMakeClause,
}: {
  ref_: string;
  p: TeacherProposal;
  onChange: (p: TeacherProposal) => void;
  onMakeClause: () => void;
}) {
  const flag = async (patch: { shown?: boolean; showName?: boolean }) => {
    const d = await api<{ id: number; shown: boolean; showName: boolean }>("/api/amana/proposals", "POST", {
      ref: ref_,
      userId: p.userId,
      questionKey: p.questionKey,
      ...patch,
    });
    onChange({ ...p, proposalId: d.id, shown: d.shown, showName: d.showName });
  };
  return (
    <li className={`rounded-xl border-2 p-3 ${p.shown ? "border-[color:var(--success)]/50 bg-[color:var(--success)]/5" : "border-[color:var(--border)] bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-[color:var(--primary)]">
          {p.name}
          {p.klass && <span className="font-normal text-[color:var(--foreground)]/50"> · {p.klass}</span>}
        </span>
        <span className="rounded-full bg-[color:var(--background)] px-2 py-0.5 text-xs font-bold text-[color:var(--primary)]">👍 {p.votes}</span>
      </div>
      <p className="mt-1.5 text-sm leading-6">״{p.text}״</p>
      {p.parts.length > 0 && (
        <details className="mt-1 text-xs text-[color:var(--foreground)]/65">
          <summary className="cursor-pointer font-bold">כל התשובה</summary>
          <ul className="mt-1 space-y-1">
            {p.parts.map((part, i) => (
              <li key={i}>
                <b>{part.label}:</b> {part.text || "—"}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ActionButton
          onClick={() => flag({ shown: !p.shown })}
          doneLabel={p.shown ? "✓ מוצג לכיתה" : "✓ הוסתר"}
          className={p.shown ? "bg-[color:var(--success)] text-white" : "border border-[color:var(--success)] text-[color:var(--success)]"}
        >
          {p.shown ? "✓ מוצג לכיתה (להסתיר)" : "👁️ הצג לכיתה"}
        </ActionButton>
        {p.shown && (
          <ActionButton
            onClick={() => flag({ showName: !p.showName })}
            className="border border-[color:var(--border)] text-[color:var(--primary)]"
          >
            {p.showName ? "🙂 עם שם (להסתיר שם)" : "🕶️ בלי שם (להציג שם)"}
          </ActionButton>
        )}
        <button
          type="button"
          onClick={onMakeClause}
          className="rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-bold text-white hover:opacity-90"
        >
          📜 הפוך לסעיף
        </button>
      </div>
    </li>
  );
}

export default function AmanaAdmin({
  initialClauses,
  initialUnits,
  unitOptions,
  focusUnit,
  today,
}: {
  initialClauses: Clause[];
  initialUnits: UnitProposals[];
  unitOptions: UnitOption[];
  focusUnit: string | null;
  today: string;
}) {
  const [clauses, setClauses] = useState(initialClauses);
  const [units, setUnits] = useState(initialUnits);
  const [draft, setDraft] = useState<ClauseInput>({ ...EMPTY_DRAFT, clauseDate: today, unitRef: focusUnit });
  const [adding, setAdding] = useState(false);
  const [addPhase, setAddPhase] = useState<Phase>("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const unitName = (ref: string | null) => (ref ? unitOptions.find((u) => u.ref === ref)?.label ?? ref : null);

  useEffect(() => {
    if (!focusUnit) return;
    document.getElementById(`unit-${focusUnit}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusUnit]);

  const approved = clauses.filter((c) => c.status === "approved").length;
  const presented = clauses.filter((c) => c.status === "presented").length;

  const openAdd = (seed?: ClauseInput) => {
    setDraft({ ...EMPTY_DRAFT, clauseDate: today, unitRef: focusUnit, ...seed });
    setAdding(true);
    setAddError(null);
    window.setTimeout(() => addRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const add = async () => {
    if (!draft.text?.trim()) {
      setAddError("חסר נוסח לסעיף.");
      return;
    }
    setAddPhase("working");
    setAddError(null);
    try {
      const d = await api("/api/amana", "POST", { clause: draft });
      setClauses(d.clauses);
      setAddPhase("done");
      window.setTimeout(() => {
        setAddPhase("idle");
        setAdding(false);
        setDraft({ ...EMPTY_DRAFT, clauseDate: today });
      }, 1300);
    } catch (e) {
      setAddPhase("error");
      setAddError(e instanceof Error ? e.message : "לא נשמר");
      window.setTimeout(() => setAddPhase("idle"), 1800);
    }
  };

  const linkBtn = "rounded-full border px-3.5 py-1.5 text-xs font-bold transition hover:shadow";

  return (
    <div className="space-y-8">
      {/* summary + tools */}
      <section className="rounded-2xl border-2 border-[#d9c3a5] p-5" style={{ background: "linear-gradient(135deg, #fdf3e1, #fffaf0)" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-extrabold text-[color:var(--primary)]">
              ✅ {approved} סעיפים אושרו מתוך {clauses.length}
            </p>
            <p className="mt-0.5 text-sm text-[color:var(--foreground)]/65">
              {presented > 0 ? `${presented} הוצגו להנהלה ומחכים לתשובה · ` : ""}
              {CLAUSE_STATUSES.map((s) => `${CLAUSE_STATUS_META[s].label}: ${clauses.filter((c) => c.status === s).length}`).join(" · ")}
            </p>
            {clauses.length > 0 && (
              <div className="mt-2 flex h-2.5 w-64 max-w-full overflow-hidden rounded-full bg-[color:var(--border)]/60" aria-hidden>
                {CLAUSE_STATUSES.map((s) => {
                  const n = clauses.filter((c) => c.status === s).length;
                  return n ? <span key={s} style={{ width: `${(n / clauses.length) * 100}%`, background: CLAUSE_STATUS_META[s].color }} /> : null;
                })}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/dashboard/amana/board" target="_blank" rel="noopener noreferrer" className={`${linkBtn} border-[color:var(--primary)] bg-[color:var(--primary)] text-white`}>🖥️ מצב הקרנה ↗</a>
            <a href="/amana" target="_blank" rel="noopener noreferrer" className={`${linkBtn} border-[color:var(--border)] text-[color:var(--primary)]`}>👀 מה התלמידים רואים ↗</a>
            <a href="/dashboard/amana/print?size=a4" target="_blank" rel="noopener noreferrer" className={`${linkBtn} border-[color:var(--border)] text-[color:var(--primary)]`}>🖨️ גרסה לעיצוב A4</a>
            <a href="/dashboard/amana/print?size=a3" target="_blank" rel="noopener noreferrer" className={`${linkBtn} border-[color:var(--border)] text-[color:var(--primary)]`}>🖼️ פוסטר A3</a>
            <a href="/api/amana/export" className={`${linkBtn} border-[color:var(--border)] text-[color:var(--primary)]`}>📄 ייצוא טקסט (מאושרים)</a>
            <a href="/api/amana/export?all=1" className={`${linkBtn} border-[color:var(--border)] text-[color:var(--primary)]/70`}>📄 ייצוא טקסט (הכול)</a>
          </div>
        </div>
      </section>

      {/* clauses */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-[color:var(--primary)]">📜 סעיפי האמנה</h2>
          {!adding && (
            <button type="button" onClick={() => openAdd()} className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-white shadow hover:opacity-90">
              ➕ הוספת סעיף
            </button>
          )}
        </div>
        {clauses.length === 0 && !adding && (
          <p className="rounded-2xl border border-dashed border-[color:var(--border)] px-6 py-8 text-center text-sm text-[color:var(--foreground)]/55">עוד אין סעיפים באמנה.</p>
        )}
        <ol className="space-y-3">
          {clauses.map((c) => (
            <ClauseRow key={c.id} clause={c} total={clauses.length} units={unitOptions} unitName={unitName(c.unitRef)} onClauses={setClauses} />
          ))}
        </ol>

        {adding && (
          <div ref={addRef} className="mt-4 rounded-2xl border-2 border-dashed border-[color:var(--accent)] bg-[color:var(--card)] p-5">
            <p className="mb-3 font-display text-lg font-bold text-[color:var(--primary)]">➕ סעיף חדש — סעיף {clauses.length + 1}</p>
            <ClauseFields value={draft} onChange={setDraft} units={unitOptions} />
            {addError && <p className="mt-2 text-sm font-bold text-[color:var(--danger)]">{addError}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={add}
                disabled={addPhase === "working" || addPhase === "done"}
                className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white shadow transition ${addPhase === "done" ? "scale-105 bg-[color:var(--success)]" : addPhase === "error" ? "bg-[color:var(--danger)]" : "bg-[color:var(--accent)] hover:scale-[1.03]"}`}
              >
                {addPhase === "working" && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {addPhase === "done" ? "✓ נוסף לאמנה!" : addPhase === "working" ? "מוסיפים…" : "הוספה לאמנה"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-sm font-bold text-[color:var(--foreground)]/60">ביטול</button>
              <span className="text-xs text-[color:var(--foreground)]/50">אם מצב ההקרנה פתוח — הסעיף ״ייכתב״ על המסך מול הכיתה.</span>
            </div>
          </div>
        )}
      </section>

      {/* proposals */}
      <section>
        <h2 className="font-display text-xl font-bold text-[color:var(--primary)]">💡 הצעות התלמידים לפי יחידה</h2>
        <p className="mb-3 mt-1 text-sm text-[color:var(--foreground)]/60">
          כל תשובה לשאלה שהתווית שלה ״מהפסוק לבית הספר · אמנת הכיתה״ נאספת כאן כהצעה. תלמידים רואים רק הצעות שסימנת ״הצג לכיתה״, ובלי שמות אלא אם בחרת להציג.
        </p>
        {units.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--border)] px-6 py-8 text-center text-sm leading-6 text-[color:var(--foreground)]/60">
            עוד אין ביחידות שאלות ״מהפסוק לבית הספר · אמנת הכיתה״.
            <br />
            אפשר להוסיף שאלה כזאת לכל יחידה בעריכת דף העבודה (כפתור ״📜 שאלת אמנה״), או לבקש מקלוד בצ׳אט.
          </p>
        ) : (
          <div className="space-y-5">
            {units.map((u) => (
              <div
                key={u.ref}
                id={`unit-${u.ref}`}
                className={`scroll-mt-24 rounded-2xl border bg-[color:var(--card)] p-5 ${focusUnit === u.ref ? "border-2 border-[color:var(--accent)] shadow-md" : "border-[color:var(--border)]"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold text-[color:var(--accent)]">{u.unit}</p>
                    <h3 className="font-display text-base font-bold text-[color:var(--primary)]">{u.title}</h3>
                    {u.questions.map((q) => (
                      <p key={q.key} className="mt-1 text-xs text-[color:var(--foreground)]/60">❓ {q.prompt}</p>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[color:var(--background)] px-3 py-1 text-xs font-bold text-[color:var(--primary)]">
                      {u.proposals.length} הצעות · {u.proposals.filter((p) => p.shown).length} מוצגות
                    </span>
                    <button
                      type="button"
                      onClick={() => openAdd({ unitRef: u.ref })}
                      className="rounded-full border border-[color:var(--accent)] px-3 py-1 text-xs font-bold text-[color:var(--accent)]"
                    >
                      ➕ סעיף ליחידה הזאת
                    </button>
                  </div>
                </div>
                {u.proposals.length === 0 ? (
                  <p className="mt-3 text-sm text-[color:var(--foreground)]/50">עוד אין תשובות לשאלת האמנה ביחידה הזאת.</p>
                ) : (
                  <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
                    {u.proposals.map((p) => (
                      <ProposalRow
                        key={`${p.userId}-${p.questionKey}`}
                        ref_={u.ref}
                        p={p}
                        onChange={(next) =>
                          setUnits((us) =>
                            us.map((x) =>
                              x.ref !== u.ref ? x : { ...x, proposals: x.proposals.map((y) => (y.userId === next.userId && y.questionKey === next.questionKey ? next : y)) }
                            )
                          )
                        }
                        onMakeClause={() => openAdd({ text: p.text, unitRef: u.ref, proposedBy: p.name })}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
