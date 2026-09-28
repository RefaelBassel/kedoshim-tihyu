"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscussionQuestion, ReviewDeck } from "@/content/tasks/types";
import SaveButton from "@/components/save-button";

// In-place editors for the per-unit texts of the debate layer: the
// discussion question (debated at the start of the next lesson) and the
// review deck. The ReviewEditor is the deck's full editor — points, skill,
// the discussion question that closes the deck — and it can ask Claude for
// a revision on the teacher's instruction. Claude only PROPOSES; the
// proposal lands in the fields, she reads it, edits if she likes, and only
// "שמירת השינויים" makes it real. Teachers only.

async function put(contentRef: string, field: string, body: Record<string, unknown>) {
  const res = await fetch("/api/content-overrides", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentRef, field, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "השמירה נכשלה");
  return data;
}

export function DiscussionEditor({
  contentRef,
  initial,
  onClose,
}: {
  contentRef: string;
  initial: DiscussionQuestion | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial?.question ?? "");
  const [note, setNote] = useState(initial?.teacherNote ?? "");
  const [saved, setSaved] = useState(JSON.stringify({ q: initial?.question ?? "", note: initial?.teacherNote ?? "" }));
  const dirty = q.trim().length > 0 && JSON.stringify({ q: q.trim(), note: note.trim() }) !== saved;

  const save = async () => {
    const d = await put(contentRef, "discussion", { value: { question: q, teacherNote: note } });
    setQ(d.value.question);
    setNote(d.value.teacherNote ?? "");
    setSaved(JSON.stringify({ q: d.value.question, note: d.value.teacherNote ?? "" }));
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
      <label className="block text-[11px] font-semibold text-[color:var(--primary)]/60">
        שאלת הדיון של היחידה — נדונה בכיתה בפתיחת השיעור הבא, רק על ידי מי שסיימו את המשימה
      </label>
      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        rows={3}
        placeholder="שאלה שמי שלא למד את הפסוקים לא יכול באמת לדון בה…"
        className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-7 outline-none focus:border-[color:var(--accent)]"
      />
      <label className="mt-3 block text-[11px] font-semibold text-[color:var(--primary)]/60">
        הערה לך בלבד (לא מוצגת לתלמידים) — על מה בפסוקים כל צד יכול להישען
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <SaveButton dirty={dirty} onSave={save} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("לחזור לנוסח המקורי של שאלת הדיון?")) return;
              await put(contentRef, "discussion", { reset: true });
              router.refresh();
              onClose?.();
            }}
            className="text-xs font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--danger)]"
          >
            ↺ לנוסח המקורי
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]/70">
              סגירה
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Proposal {
  points: string[];
  skill: string;
  question: string | null;
  teacherNote: string | null;
  note: string;
}

export function ReviewEditor({
  contentRef,
  initial,
  initialDiscussion = null,
  onClose,
}: {
  contentRef: string;
  initial: ReviewDeck | null;
  initialDiscussion?: DiscussionQuestion | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState((initial?.points ?? []).join("\n"));
  const [skill, setSkill] = useState(initial?.skill ?? "");
  const [question, setQuestion] = useState(initialDiscussion?.question ?? "");
  const [teacherNote, setTeacherNote] = useState(initialDiscussion?.teacherNote ?? "");
  const norm = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  const snap = (p: string[], s: string, q: string, n: string) => JSON.stringify({ p, s, q, n });
  const [saved, setSaved] = useState(
    snap(initial?.points ?? [], initial?.skill ?? "", initialDiscussion?.question ?? "", initialDiscussion?.teacherNote ?? "")
  );
  const dirty =
    norm(text).length > 0 &&
    snap(norm(text), skill.trim(), question.trim(), teacherNote.trim()) !== saved;

  // ---- ask Claude ----
  const [instruction, setInstruction] = useState("");
  const [withQuestion, setWithQuestion] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const ask = async () => {
    if (!instruction.trim()) return;
    setAsking(true);
    setAskErr(null);
    setProposal(null);
    try {
      const r = await fetch("/api/content-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentRef, instruction, includeQuestion: withQuestion }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "משהו השתבש");
      setProposal(d.proposal);
    } catch (e) {
      setAskErr(e instanceof Error ? e.message : "משהו השתבש");
    } finally {
      setAsking(false);
    }
  };
  const applyProposal = () => {
    if (!proposal) return;
    setText(proposal.points.join("\n"));
    if (proposal.skill) setSkill(proposal.skill);
    if (proposal.question) setQuestion(proposal.question);
    if (proposal.teacherNote) setTeacherNote(proposal.teacherNote);
    setProposal(null);
  };

  const save = async () => {
    const d = await put(contentRef, "review", { value: { points: norm(text), skill } });
    let q = question.trim();
    let n = teacherNote.trim();
    if (q) {
      const d2 = await put(contentRef, "discussion", { value: { question: q, teacherNote: n } });
      q = d2.value.question;
      n = d2.value.teacherNote ?? "";
      setQuestion(q);
      setTeacherNote(n);
    }
    setText(d.value.points.join("\n"));
    setSkill(d.value.skill ?? "");
    setSaved(snap(d.value.points, d.value.skill ?? "", q, n));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* manual editing */}
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
        <label className="block text-[11px] font-semibold text-[color:var(--primary)]/60">
          נקודות החזרה — שורה לכל שקף (2-4 שורות, קצר מאוד: תזכורת למי שלמד, לא תחליף ללימוד)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"אהרן נכנס לקודש פעם בשנה בלבד\nשני שעירים — לה׳ ולעזאזל\n…"}
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-7 outline-none focus:border-[color:var(--accent)]"
        />
        <label className="mt-3 block text-[11px] font-semibold text-[color:var(--primary)]/60">
          המיומנות של היחידה, בשורה אחת (שקף אופציונלי)
        </label>
        <input
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-sm outline-none focus:border-[color:var(--accent)]"
        />
        <label className="mt-3 block text-[11px] font-semibold text-[color:var(--primary)]/60">
          שאלת הדיון — השקף האחרון של המצגת, ואותה שאלה שעל לוח הדיון
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-7 outline-none focus:border-[color:var(--accent)]"
        />
        <label className="mt-2 block text-[11px] font-semibold text-[color:var(--primary)]/60">
          הערה לך בלבד — על מה בפסוקים כל צד נשען
        </label>
        <textarea
          value={teacherNote}
          onChange={(e) => setTeacherNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <SaveButton dirty={dirty} onSave={save} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("לחזור לנוסח המקורי של המצגת ושל שאלת הדיון?")) return;
                await put(contentRef, "review", { reset: true });
                await put(contentRef, "discussion", { reset: true });
                router.refresh();
                onClose?.();
              }}
              className="text-xs font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--danger)]"
            >
              ↺ לנוסח המקורי
            </button>
            {onClose && (
              <button type="button" onClick={onClose} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]/70">
                סגירה
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ask Claude */}
      <div className="rounded-xl border border-dashed border-[color:var(--accent)]/60 bg-[color:var(--card)] p-4">
        <p className="mb-1 text-sm font-bold text-[color:var(--primary)]">✨ לבקש מקלוד שינוי</p>
        <p className="mb-2 text-[11px] text-[color:var(--foreground)]/60">
          כתבי במילים שלך מה לשנות — ״קצר יותר״, ״הוסיפי נקודה על השעיר לעזאזל״, ״שאלת דיון מזווית
          של יחסים בין אנשים״. קלוד מציע; את קוראת, עורכת אם צריך, ושומרת. עד השמירה — כלום לא משתנה.
        </p>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={2}
          placeholder="מה לשנות במצגת?"
          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--primary)]/70">
            <input type="checkbox" checked={withQuestion} onChange={(e) => setWithQuestion(e.target.checked)} />
            לשנות גם את שאלת הדיון
          </label>
          <button
            type="button"
            onClick={ask}
            disabled={asking || !instruction.trim()}
            className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-bold text-white shadow transition hover:scale-[1.03] disabled:opacity-40 disabled:hover:scale-100"
          >
            {asking ? "קלוד חושב…" : "✨ להציע שינוי"}
          </button>
          {askErr && <span className="text-xs text-[color:var(--danger)]">{askErr}</span>}
        </div>

        {proposal && (
          <div className="mt-3 rounded-xl border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/6 p-3">
            <p className="mb-1 text-[11px] font-bold text-[color:var(--accent)]">ההצעה של קלוד</p>
            {proposal.note && <p className="mb-2 text-xs italic text-[color:var(--foreground)]/70">{proposal.note}</p>}
            <ol className="mb-2 list-decimal space-y-0.5 ps-5 text-sm">
              {proposal.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
            {proposal.skill && <p className="text-xs"><b>מיומנות:</b> {proposal.skill}</p>}
            {proposal.question && (
              <p className="mt-1 text-sm"><b>💬 שאלת הדיון:</b> {proposal.question}</p>
            )}
            {proposal.teacherNote && (
              <p className="mt-0.5 text-xs text-[color:var(--foreground)]/70"><b>🗝️ לך:</b> {proposal.teacherNote}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={applyProposal}
                className="rounded-full bg-[color:var(--primary)] px-4 py-1.5 text-xs font-bold text-white shadow transition hover:scale-[1.03]"
              >
                ⬆ להכניס לשדות (ואז לשמור)
              </button>
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-[color:var(--primary)]/70"
              >
                לא, תודה
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
