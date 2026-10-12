"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AutosaveStatus, useAutosave } from "@/components/autosave";
import { etnachtaSplit, verseByNum } from "@/lib/etnachta";
import type { PrepDoc, PrepItem, PrepItemKind, PrepRow, PrepStudentRow } from "@/lib/exam-prep";

// Under the exam editor: the preparation page for students, built to match
// the exam. Everything is editable and saves itself; it stays hidden until
// she presses "פרסום לתלמידים" (and can be hidden again). Below the editor:
// who started and who finished — for her eyes only.

type Progress = { students: PrepStudentRow[]; started: number; completed: number; total: number } | null;
type Discussion = { ref: string; unit: string; question: string };

const KIND_LABEL: Record<PrepItemKind, string> = {
  choice: "בחירה — תשובה אחת",
  multi: "בחירה — כמה תשובות נכונות",
  verse: "באיזה פסוק? (מספר פסוק)",
  etnachta: "לחיצה על מילת האתנחתא",
  short: "תשובה קצרה (מילה או שתיים)",
  open: "שאלה פתוחה (בדיקה עצמית)",
};

const blankDoc = (refs: string[]): PrepDoc => ({
  title: "הכנה למבחן",
  intro: "",
  map: [],
  terms: [],
  practice: [],
  argument: { intro: "בחרו אחת משאלות הדיון, וכתבו טענה, נימוק וביסוס (ציטוט ומספר פסוק).", refs },
});

export default function ExamPrepEditor({
  examId,
  initial,
  progress: initialProgress,
  discussions,
}: {
  examId: number;
  initial: PrepRow | null;
  progress: Progress;
  discussions: Discussion[];
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<PrepDoc | null>(initial?.doc ?? null);
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft");
  const [publishing, setPublishing] = useState<"idle" | "working" | "done" | "error">("idle");
  const [pubError, setPubError] = useState<string | null>(null);
  const [gen, setGen] = useState<"idle" | "confirm" | "working" | "error">("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [refreshing, setRefreshing] = useState(false);

  const save = useCallback(
    async (d: PrepDoc | null) => {
      if (!d) return;
      const r = await fetch(`/api/exams/${examId}/prep`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: d }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error ?? "השמירה נכשלה");
    },
    [examId]
  );
  const autosave = useAutosave(doc, save);

  const setPublished = async (next: "draft" | "published") => {
    if (!doc) return;
    setPublishing("working");
    setPubError(null);
    try {
      const r = await fetch(`/api/exams/${examId}/prep`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, status: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error ?? "לא הצליח");
      autosave.reset(doc);
      setStatus(j.prep.status);
      setPublishing("done");
      window.setTimeout(() => setPublishing("idle"), 2200);
      router.refresh();
    } catch (e) {
      setPublishing("error");
      setPubError(e instanceof Error ? e.message : "לא הצליח");
    }
  };

  const generate = async () => {
    setGen("working");
    setGenError(null);
    setSeconds(0);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    try {
      const r = await fetch(`/api/exams/${examId}/prep`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error ?? "הפקת ההכנה נכשלה");
      autosave.reset(d.prep.doc);
      setDoc(d.prep.doc);
      setStatus(d.prep.status);
      setGen("idle");
      router.refresh();
    } catch (e) {
      setGen("error");
      setGenError(e instanceof Error ? e.message : "הפקת ההכנה נכשלה");
    } finally {
      clearInterval(tick);
    }
  };

  const refreshProgress = async () => {
    setRefreshing(true);
    try {
      const r = await fetch(`/api/exams/${examId}/prep`);
      const d = await r.json().catch(() => ({}));
      if (d.ok) setProgress(d.progress);
    } finally {
      setRefreshing(false);
    }
  };

  const field = "w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[color:var(--accent)]";
  const chip = "rounded-full border border-[color:var(--border)] px-2.5 py-0.5 text-xs font-bold text-[color:var(--primary)] transition hover:border-[color:var(--accent)] active:scale-95 disabled:opacity-30";
  const published = status === "published";

  const patch = (fn: (d: PrepDoc) => PrepDoc) => setDoc((d) => (d ? fn(d) : d));
  const patchItem = (id: string, fn: (q: PrepItem) => PrepItem) => patch((d) => ({ ...d, practice: d.practice.map((q) => (q.id === id ? fn(q) : q)) }));
  const moveIn = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  return (
    <section className="mx-auto mt-10 max-w-6xl rounded-3xl border-2 border-dashed border-[color:var(--primary)]/40 bg-[color:var(--card)] p-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-[color:var(--primary)]">📚 דף הכנה למבחן — לתלמידים</h2>
          <p className="max-w-2xl text-xs text-[color:var(--primary)]/60">
            מפת הפרק, ביטויים שחייבים להכיר, תרגול שנבדק מיד, ותרגול טיעון עם משוב מקלוד. התלמידים רואים את הדף (ב״משימות שוטפות״ וב״הכנות למבחנים״) רק אחרי ״פרסום לתלמידים״ — ואת המבחן עצמו לעולם לא.
          </p>
        </div>
        {doc && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${published ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" : "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"}`}>
              {published ? "👁 מפורסם לתלמידים" : "🔒 מוסתר מהתלמידים"}
            </span>
            <AutosaveStatus state={autosave.state} error={autosave.error} onRetry={autosave.flush} />
          </div>
        )}
      </div>

      {!doc ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setDoc(blankDoc(discussions.map((d) => d.ref)))} className="rounded-full border-2 border-[color:var(--primary)]/50 px-5 py-2 text-sm font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 active:scale-95">
            ✏️ דף הכנה ריק
          </button>
          <GenerateButton gen={gen} seconds={seconds} hasDoc={false} onStart={generate} onConfirm={() => setGen("confirm")} onCancel={() => setGen("idle")} />
          {gen === "error" && genError && <p className="text-xs font-bold text-[color:var(--danger)]">{genError}</p>}
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {/* publish bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[color:var(--background)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {published ? (
                <button type="button" disabled={publishing === "working"} onClick={() => setPublished("draft")} className="inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--warning)] px-5 py-2 text-sm font-extrabold text-[color:var(--warning)] transition hover:bg-[color:var(--warning)]/10 active:scale-95">
                  {publishing === "working" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
                  {publishing === "working" ? "מסתיר…" : publishing === "done" ? "✓ הוסתר" : "🔒 הסתרה מהתלמידים"}
                </button>
              ) : (
                <button type="button" disabled={publishing === "working"} onClick={() => setPublished("published")} className={`inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-extrabold text-white shadow transition active:scale-95 ${publishing === "working" ? "scale-[0.97] opacity-90" : "hover:scale-[1.03]"}`} style={{ background: "linear-gradient(135deg, var(--success), var(--primary))" }}>
                  {publishing === "working" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                  {publishing === "working" ? "מפרסם…" : "📣 פרסום לתלמידים"}
                </button>
              )}
              {publishing === "done" && published && <span className="text-xs font-bold text-[color:var(--success)]">✓ פורסם — התלמידים רואים את הדף עכשיו</span>}
              {publishing === "error" && pubError && <span className="text-xs font-bold text-[color:var(--danger)]">{pubError}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {published && (
                <a href="/exams" target="_blank" className="text-xs font-bold text-[color:var(--primary)]/70 hover:text-[color:var(--accent)]">
                  ↗ כפי שהתלמידים רואים
                </a>
              )}
              <GenerateButton gen={gen} seconds={seconds} hasDoc onStart={generate} onConfirm={() => setGen("confirm")} onCancel={() => setGen("idle")} />
            </div>
          </div>
          {gen === "error" && genError && <p className="text-xs font-bold text-[color:var(--danger)]">{genError}</p>}

          {/* class progress — teacher only */}
          {progress && <ClassProgress progress={progress} published={published} refreshing={refreshing} onRefresh={refreshProgress} />}

          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            כותרת
            <input className={`${field} mt-1 font-display font-extrabold`} value={doc.title} onChange={(e) => patch((d) => ({ ...d, title: e.target.value }))} />
          </label>
          <label className="block text-xs font-bold text-[color:var(--primary)]/70">
            פתיח לתלמידים
            <textarea className={`${field} mt-1`} rows={3} value={doc.intro} onChange={(e) => patch((d) => ({ ...d, intro: e.target.value }))} />
          </label>

          {/* (1) map */}
          <EditorBlock title="🗺️ מפת הפרק" onAdd={() => patch((d) => ({ ...d, map: [...d.map, { title: "", verses: "", summary: "" }] }))} addLabel="＋ חלק">
            {doc.map.map((m, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-2 sm:grid-cols-[1fr_110px_2fr_auto]">
                <input className={field} placeholder="שם החלק" value={m.title} onChange={(e) => patch((d) => ({ ...d, map: d.map.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
                <input className={field} placeholder="פסוקים" value={m.verses} onChange={(e) => patch((d) => ({ ...d, map: d.map.map((x, j) => (j === i ? { ...x, verses: e.target.value } : x)) }))} />
                <textarea className={field} rows={2} placeholder="משפט אחד" value={m.summary} onChange={(e) => patch((d) => ({ ...d, map: d.map.map((x, j) => (j === i ? { ...x, summary: e.target.value } : x)) }))} />
                <RowTools first={i === 0} last={i === doc.map.length - 1} onUp={() => patch((d) => ({ ...d, map: moveIn(d.map, i, -1) }))} onDown={() => patch((d) => ({ ...d, map: moveIn(d.map, i, 1) }))} onDelete={() => patch((d) => ({ ...d, map: d.map.filter((_, j) => j !== i) }))} chip={chip} />
              </div>
            ))}
          </EditorBlock>

          {/* (2) terms */}
          <EditorBlock title="🔤 ביטויים שחייבים להכיר" onAdd={() => patch((d) => ({ ...d, terms: [...d.terms, { term: "", verses: "", note: "" }] }))} addLabel="＋ ביטוי">
            {doc.terms.map((t, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-2 sm:grid-cols-[1fr_110px_2fr_auto]">
                <input className={`${field} font-mikra text-base`} placeholder="הביטוי" value={t.term} onChange={(e) => patch((d) => ({ ...d, terms: d.terms.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)) }))} />
                <input className={field} placeholder="פסוק" value={t.verses} onChange={(e) => patch((d) => ({ ...d, terms: d.terms.map((x, j) => (j === i ? { ...x, verses: e.target.value } : x)) }))} />
                <input className={field} placeholder="הסבר קצר (לא חובה)" value={t.note} onChange={(e) => patch((d) => ({ ...d, terms: d.terms.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) }))} />
                <RowTools first={i === 0} last={i === doc.terms.length - 1} onUp={() => patch((d) => ({ ...d, terms: moveIn(d.terms, i, -1) }))} onDown={() => patch((d) => ({ ...d, terms: moveIn(d.terms, i, 1) }))} onDelete={() => patch((d) => ({ ...d, terms: d.terms.filter((_, j) => j !== i) }))} chip={chip} />
              </div>
            ))}
          </EditorBlock>

          {/* (3) practice */}
          <EditorBlock
            title={`✍️ תרגול עם בדיקה מיידית (${doc.practice.length})`}
            onAdd={() => patch((d) => ({ ...d, practice: [...d.practice, { id: `p${Date.now().toString(36)}`, kind: "choice", text: "", options: ["", ""], correct: [], explain: "" }] }))}
            addLabel="＋ שאלת תרגול"
          >
            {doc.practice.map((q, i) => (
              <PracticeItemEditor
                key={q.id}
                n={i + 1}
                item={q}
                field={field}
                chip={chip}
                first={i === 0}
                last={i === doc.practice.length - 1}
                onChange={(fn) => patchItem(q.id, fn)}
                onUp={() => patch((d) => ({ ...d, practice: moveIn(d.practice, i, -1) }))}
                onDown={() => patch((d) => ({ ...d, practice: moveIn(d.practice, i, 1) }))}
                onDelete={() => patch((d) => ({ ...d, practice: d.practice.filter((x) => x.id !== q.id) }))}
              />
            ))}
          </EditorBlock>

          {/* (4) argument */}
          <div className="rounded-2xl border border-[color:var(--border)] p-4">
            <h3 className="font-display text-base font-extrabold text-[color:var(--primary)]">💬 תרגול טיעון — משוב קצר מקלוד</h3>
            <textarea className={`${field} mt-2`} rows={2} value={doc.argument.intro} onChange={(e) => patch((d) => ({ ...d, argument: { ...d.argument, intro: e.target.value } }))} />
            <p className="mt-3 text-xs font-bold text-[color:var(--primary)]/70">שאלות הדיון שהתלמידים בוחרים מהן (הנוסח מגיע מהיחידות — עורכים אותו בתוכן היחידה):</p>
            <ul className="mt-1 space-y-1">
              {discussions.map((d) => (
                <li key={d.ref}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-sm leading-6 hover:bg-[color:var(--background)]">
                    <input
                      type="checkbox"
                      className="mt-1.5"
                      checked={doc.argument.refs.includes(d.ref)}
                      onChange={(e) =>
                        patch((x) => ({
                          ...x,
                          argument: {
                            ...x.argument,
                            refs: e.target.checked ? discussions.map((o) => o.ref).filter((r) => r === d.ref || x.argument.refs.includes(r)) : x.argument.refs.filter((r) => r !== d.ref),
                          },
                        }))
                      }
                    />
                    <span>
                      <b className="text-[color:var(--accent)]">{d.unit}: </b>
                      {d.question}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function GenerateButton({ gen, seconds, hasDoc, onStart, onConfirm, onCancel }: { gen: string; seconds: number; hasDoc: boolean; onStart: () => void; onConfirm: () => void; onCancel: () => void }) {
  if (gen === "working") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)]/10 px-4 py-1.5 text-xs font-bold text-[color:var(--primary)]">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
        קלוד כותב דף הכנה… {seconds} שנ׳
      </span>
    );
  }
  if (gen === "confirm" && hasDoc) {
    return (
      <span className="flex items-center gap-2 text-xs font-bold">
        להחליף את כל הדף בטיוטה חדשה מקלוד? (תוסתר מהתלמידים)
        <button type="button" onClick={onStart} className="rounded-full bg-[color:var(--danger)] px-3 py-1 text-white active:scale-95">
          כן, להחליף
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-[color:var(--border)] px-3 py-1">
          ביטול
        </button>
      </span>
    );
  }
  return (
    <button type="button" onClick={hasDoc ? onConfirm : onStart} className="text-xs font-bold text-[color:var(--primary)]/60 underline-offset-2 hover:text-[color:var(--accent)] hover:underline">
      ✨ {hasDoc ? "טיוטה חדשה מקלוד (מחליפה את הדף)" : "טיוטה מקלוד לפי המבחן"}
    </button>
  );
}

function EditorBlock({ title, children, onAdd, addLabel }: { title: string; children: React.ReactNode; onAdd: () => void; addLabel: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-extrabold text-[color:var(--primary)]">{title}</h3>
        <button type="button" onClick={onAdd} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)] transition hover:border-[color:var(--accent)] active:scale-95">
          {addLabel}
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RowTools({ first, last, onUp, onDown, onDelete, chip }: { first: boolean; last: boolean; onUp: () => void; onDown: () => void; onDelete: () => void; chip: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="flex items-center gap-1 self-start">
      <button type="button" aria-label="למעלה" disabled={first} onClick={onUp} className={chip}>
        ↑
      </button>
      <button type="button" aria-label="למטה" disabled={last} onClick={onDown} className={chip}>
        ↓
      </button>
      {confirm ? (
        <>
          <button type="button" onClick={onDelete} className="rounded-full bg-[color:var(--danger)] px-2.5 py-0.5 text-xs font-bold text-white active:scale-95">
            למחוק
          </button>
          <button type="button" onClick={() => setConfirm(false)} className={chip}>
            ביטול
          </button>
        </>
      ) : (
        <button type="button" aria-label="מחיקה" onClick={() => setConfirm(true)} className="rounded-full px-2 py-0.5 text-xs font-bold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10">
          🗑
        </button>
      )}
    </span>
  );
}

function PracticeItemEditor({
  n,
  item,
  field,
  chip,
  first,
  last,
  onChange,
  onUp,
  onDown,
  onDelete,
}: {
  n: number;
  item: PrepItem;
  field: string;
  chip: string;
  first: boolean;
  last: boolean;
  onChange: (fn: (q: PrepItem) => PrepItem) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const verse = item.kind === "etnachta" && item.verseNum ? verseByNum(item.verseNum) : null;
  const split = verse ? etnachtaSplit(verse) : null;
  const setOption = (i: number, text: string) =>
    onChange((q) => {
      const old = q.options[i];
      return { ...q, options: q.options.map((o, j) => (j === i ? text : o)), correct: q.correct.map((c) => (c === old ? text : c)) };
    });
  const toggleCorrect = (o: string, on: boolean) =>
    onChange((q) => ({ ...q, correct: q.kind === "choice" ? (on ? [o] : []) : on ? [...q.correct.filter((c) => c !== o), o] : q.correct.filter((c) => c !== o) }));

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold text-[color:var(--primary)]">{n}.</span>
        <select className="rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-xs font-bold" value={item.kind} onChange={(e) => onChange((q) => ({ ...q, kind: e.target.value as PrepItemKind, correct: [] }))}>
          {(Object.keys(KIND_LABEL) as PrepItemKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="ms-auto">
          <RowTools first={first} last={last} onUp={onUp} onDown={onDown} onDelete={onDelete} chip={chip} />
        </span>
      </div>
      <textarea className={`${field} mt-2`} rows={2} placeholder="נוסח השאלה" value={item.text} onChange={(e) => onChange((q) => ({ ...q, text: e.target.value }))} />

      {(item.kind === "choice" || item.kind === "multi") && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-bold text-[color:var(--primary)]/60">{item.kind === "choice" ? "אפשרויות — סמני את הנכונה" : "אפשרויות — סמני את כל הנכונות"}</p>
          {item.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={item.kind === "choice" ? "radio" : "checkbox"}
                name={`correct-${item.id}`}
                checked={o !== "" && item.correct.includes(o)}
                onChange={(e) => toggleCorrect(o, e.target.checked)}
                title="תשובה נכונה"
              />
              <input className={`${field} py-1`} value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`אפשרות ${i + 1}`} />
              <button type="button" aria-label="הסרת אפשרות" onClick={() => onChange((q) => ({ ...q, options: q.options.filter((_, j) => j !== i), correct: q.correct.filter((c) => c !== o) }))} className="text-xs font-bold text-[color:var(--danger)]/70 hover:text-[color:var(--danger)]">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onChange((q) => ({ ...q, options: [...q.options, ""] }))} className={chip}>
            ＋ אפשרות
          </button>
        </div>
      )}
      {item.kind === "verse" && (
        <label className="mt-2 block text-[11px] font-bold text-[color:var(--primary)]/60">
          פסוקים נכונים (באותיות, מופרדים בפסיק — כל אחד מהם מתקבל)
          <input className={`${field} mt-1`} value={item.correct.join(", ")} onChange={(e) => onChange((q) => ({ ...q, correct: e.target.value.split(/[,،]/).map((x) => x.trim()) }))} placeholder="למשל: יד, יט" />
        </label>
      )}
      {item.kind === "short" && (
        <label className="mt-2 block text-[11px] font-bold text-[color:var(--primary)]/60">
          תשובות שמתקבלות (שורה לכל נוסח; ניקוד וסימנים לא משנים)
          <textarea className={`${field} mt-1`} rows={2} value={item.correct.join("\n")} onChange={(e) => onChange((q) => ({ ...q, correct: e.target.value.split("\n") }))} />
        </label>
      )}
      {item.kind === "etnachta" && (
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2 text-[11px] font-bold text-[color:var(--primary)]/60">
            פסוק (באותיות)
            <input className="w-20 rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-sm" value={item.verseNum ?? ""} onChange={(e) => onChange((q) => ({ ...q, verseNum: e.target.value }))} />
          </label>
          {verse ? (
            <p className="font-mikra rounded-lg bg-white px-3 py-1.5 text-[17px] leading-8">
              {verse}
              {split && <span className="ms-2 font-sans text-xs font-bold text-[color:var(--success)]">← האתנחתא: ״{split.word}״</span>}
            </p>
          ) : (
            item.verseNum && <p className="text-xs font-bold text-[color:var(--danger)]">הפסוק לא נמצא בפרק ט״ז</p>
          )}
        </div>
      )}
      <label className="mt-2 block text-[11px] font-bold text-[color:var(--success)]">
        {item.kind === "open" ? "תשובה לדוגמה (מוצגת אחרי שהתלמיד/ה כותב/ת)" : "הסבר שמופיע אחרי תשובה נכונה"}
        <textarea className={`${field} mt-1 bg-[color:var(--success)]/5`} rows={2} value={item.explain} onChange={(e) => onChange((q) => ({ ...q, explain: e.target.value }))} />
      </label>
    </div>
  );
}

function ClassProgress({ progress, published, refreshing, onRefresh }: { progress: NonNullable<Progress>; published: boolean; refreshing: boolean; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const n = progress.students.length;
  return (
    <div className="rounded-2xl border-2 border-[color:var(--primary)]/20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-extrabold text-[color:var(--primary)]">📊 מי מתכונן — למורה בלבד</h3>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)] transition hover:border-[color:var(--accent)] active:scale-95">
          {refreshing && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
          {refreshing ? "מרענן…" : "↻ רענון"}
        </button>
      </div>
      {!published && progress.started === 0 ? (
        <p className="mt-1 text-xs text-[color:var(--primary)]/60">הדף עוד לא פורסם — אחרי הפרסום יופיע כאן מי התחיל ומי השלים.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat value={progress.started} label="התחילו" of={n} color="var(--accent)" />
            <Stat value={progress.completed} label="השלימו — מוכנים למבחן" of={n} color="var(--success)" />
            <Stat value={n - progress.started} label="עוד לא נכנסו" of={n} color="var(--primary)" />
          </div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 text-xs font-bold text-[color:var(--primary)]/70 hover:text-[color:var(--accent)]">
            {open ? "▲ הסתרת הרשימה" : "▼ לפי תלמיד/ה"}
          </button>
          {open && (
            <ul className="mt-2 divide-y divide-[color:var(--border)] text-sm">
              {progress.students.map((s) => (
                <li key={s.userId} className="flex items-center gap-3 py-1.5">
                  <span className="w-40 truncate font-bold">{s.name}</span>
                  <span className="w-10 text-xs text-[color:var(--primary)]/60">{s.klass ?? ""}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--border)]/60">
                    <span className="block h-full rounded-full" style={{ width: `${s.total ? Math.round((100 * s.done) / s.total) : 0}%`, background: s.ready ? "var(--success)" : "var(--accent)" }} />
                  </span>
                  <span className="w-14 text-xs font-bold text-[color:var(--primary)]/70">
                    {s.done}/{s.total}
                  </span>
                  <span className="w-24 text-xs font-bold">{s.ready ? <span className="text-[color:var(--success)]">🏅 מוכנ/ה</span> : s.lastAt == null ? <span className="text-[color:var(--primary)]/40">לא התחיל/ה</span> : s.argument ? "✍️ כתב/ה טיעון" : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, of, color }: { value: number; label: string; of: number; color: string }) {
  return (
    <div className="rounded-xl bg-[color:var(--background)] px-2 py-2">
      <p className="font-display text-2xl font-extrabold" style={{ color }}>
        {value}
        <span className="text-sm text-[color:var(--primary)]/40"> / {of}</span>
      </p>
      <p className="text-[11px] font-bold text-[color:var(--primary)]/60">{label}</p>
    </div>
  );
}
