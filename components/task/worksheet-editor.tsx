"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskSection, QuestionBlock } from "@/content/tasks/types";
import type { WorksheetEdits } from "@/lib/content-overrides";
import SaveButton from "@/components/save-button";

// In-place teacher editor for the worksheet questions of ONE section (or of
// every section, on the content hub): reword a question, hide it, bring it
// back, or add one of her own. The file stays the default; what she saves
// is stored per content ref and wins. Teachers only — the affordance that
// opens this is decided on the server.
export default function WorksheetEditor({
  contentRef,
  sections,
  onlySection,
  edits,
  onClose,
}: {
  contentRef: string;
  sections: TaskSection[]; // the ORIGINAL file sections (so hidden ones can be restored)
  onlySection?: string; // limit the editor to one section key
  edits: WorksheetEdits;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(edits.hidden));
  const [prompts, setPrompts] = useState<Record<string, string>>({ ...edits.prompts });
  const [extra, setExtra] = useState(edits.extra.map((e) => ({ ...e })));
  const snapshot = (h: Set<string>, p: Record<string, string>, x: typeof extra) =>
    JSON.stringify({ h: [...h].sort(), p, x });
  const [saved, setSaved] = useState(() =>
    snapshot(new Set(edits.hidden), edits.prompts, edits.extra)
  );
  const dirty = useMemo(
    () => snapshot(hidden, prompts, extra) !== saved,
    [hidden, prompts, extra, saved]
  );

  const shown = onlySection ? sections.filter((s) => s.key === onlySection) : sections;

  const save = async () => {
    const value: WorksheetEdits = {
      hidden: [...hidden],
      prompts: Object.fromEntries(Object.entries(prompts).filter(([, v]) => v.trim())),
      extra: extra.filter((e) => e.prompt.trim()),
    };
    const res = await fetch("/api/content-overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentRef, field: "worksheet", value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "השמירה נכשלה");
    const v = data.value as WorksheetEdits;
    setHidden(new Set(v.hidden));
    setPrompts(v.prompts);
    setExtra(v.extra);
    setSaved(snapshot(new Set(v.hidden), v.prompts, v.extra));
    router.refresh();
  };

  const toggleHidden = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="rounded-2xl border-2 border-[color:var(--primary)]/30 bg-[color:var(--card)] p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">
            ✏️ עריכת השאלות
          </p>
          <p className="text-xs text-[color:var(--foreground)]/60">
            אפשר לנסח מחדש, להסתיר שאלה (היא נשארת כאן אפורה ואפשר להחזיר), או להוסיף שאלה
            משלך. מה שתשמרי — זה מה שהתלמידים יראו.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]/70 hover:border-[color:var(--accent)]"
          >
            סגירת העריכה
          </button>
        )}
      </div>

      <div className="space-y-5">
        {shown.map((sec) => {
          const qs = sec.blocks.filter((b): b is QuestionBlock => b.type === "question");
          const mine = extra.filter((e) => e.sectionKey === sec.key);
          return (
            <div key={sec.key}>
              {!onlySection && (
                <p className="mb-2 text-xs font-bold text-[color:var(--accent)]">{sec.title}</p>
              )}
              <ul className="space-y-2">
                {qs.map((q, i) => {
                  const off = hidden.has(q.key);
                  return (
                    <li
                      key={q.key}
                      className={`rounded-xl border p-3 transition ${
                        off
                          ? "border-dashed border-[color:var(--border)] bg-[color:var(--background)] opacity-60"
                          : "border-[color:var(--border)] bg-[color:var(--background)]"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[color:var(--primary)]/60">
                          שאלה {i + 1} · {q.label}
                          {off && " · מוסתרת"}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleHidden(q.key)}
                          className={`rounded-full px-3 py-0.5 text-[11px] font-bold transition ${
                            off
                              ? "bg-[color:var(--success)] text-white"
                              : "border border-[color:var(--danger)]/50 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
                          }`}
                        >
                          {off ? "↩ להחזיר" : "להסתיר"}
                        </button>
                      </div>
                      <textarea
                        value={prompts[q.key] ?? q.prompt}
                        onChange={(e) => setPrompts((p) => ({ ...p, [q.key]: e.target.value }))}
                        disabled={off}
                        rows={2}
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)] disabled:opacity-60"
                      />
                      {prompts[q.key] && prompts[q.key] !== q.prompt && (
                        <button
                          type="button"
                          onClick={() =>
                            setPrompts((p) => {
                              const n = { ...p };
                              delete n[q.key];
                              return n;
                            })
                          }
                          className="mt-1 text-[10px] font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--accent)]"
                        >
                          ↺ לנוסח המקורי של השאלה הזו
                        </button>
                      )}
                      {q.fields && q.fields.length > 0 && !off && (
                        <p className="mt-1 text-[10px] text-[color:var(--primary)]/45">
                          לשאלה יש {q.fields.length} שדות תשובה ({q.fields.map((f) => f.label).join(" · ")}) — הם נשארים.
                        </p>
                      )}
                    </li>
                  );
                })}
                {mine.map((e) => (
                  <li
                    key={e.key}
                    className="rounded-xl border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/5 p-3"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[color:var(--accent)]">
                        ✨ שאלה שלך
                      </span>
                      <button
                        type="button"
                        onClick={() => setExtra((x) => x.filter((y) => y.key !== e.key))}
                        className="rounded-full border border-[color:var(--danger)]/50 px-3 py-0.5 text-[11px] font-bold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
                      >
                        למחוק
                      </button>
                    </div>
                    <textarea
                      value={e.prompt}
                      onChange={(ev) =>
                        setExtra((x) =>
                          x.map((y) => (y.key === e.key ? { ...y, prompt: ev.target.value } : y))
                        )
                      }
                      rows={2}
                      placeholder="נוסח השאלה…"
                      className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]"
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  setExtra((x) => [
                    ...x,
                    {
                      sectionKey: sec.key,
                      key: `t-${sec.key}-${Date.now().toString(36)}`,
                      prompt: "",
                      label: "שאלה של המורה",
                      icon: "thinking",
                    },
                  ])
                }
                className="mt-2 w-full rounded-xl border-2 border-dashed border-[color:var(--border)] py-2 text-xs font-bold text-[color:var(--primary)]/70 transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
              >
                + שאלה משלך לתת-משימה זו
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] pt-4">
        <SaveButton dirty={dirty} onSave={save} />
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm("לבטל את כל העריכות של דף העבודה ולחזור לנוסח המקורי?")) return;
            await fetch("/api/content-overrides", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contentRef, field: "worksheet", reset: true }),
            });
            router.refresh();
            onClose?.();
          }}
          className="text-xs font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--danger)]"
        >
          ↺ לנוסח המקורי של כל דף העבודה
        </button>
      </div>
    </div>
  );
}
