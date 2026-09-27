"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscussionQuestion, ReviewDeck } from "@/content/tasks/types";
import SaveButton from "@/components/save-button";

// In-place editors for the two per-unit texts of the debate layer: the
// discussion question (debated at the start of the next lesson) and the
// review deck points (the 5-minute reminder). Teachers only.

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

export function ReviewEditor({
  contentRef,
  initial,
  onClose,
}: {
  contentRef: string;
  initial: ReviewDeck | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState((initial?.points ?? []).join("\n"));
  const [skill, setSkill] = useState(initial?.skill ?? "");
  const norm = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  const [saved, setSaved] = useState(JSON.stringify({ p: initial?.points ?? [], s: initial?.skill ?? "" }));
  const dirty = norm(text).length > 0 && JSON.stringify({ p: norm(text), s: skill.trim() }) !== saved;

  const save = async () => {
    const d = await put(contentRef, "review", { value: { points: norm(text), skill } });
    setText(d.value.points.join("\n"));
    setSkill(d.value.skill ?? "");
    setSaved(JSON.stringify({ p: d.value.points, s: d.value.skill ?? "" }));
    router.refresh();
  };

  return (
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <SaveButton dirty={dirty} onSave={save} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("לחזור לנוסח המקורי של מצגת החזרה?")) return;
              await put(contentRef, "review", { reset: true });
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
