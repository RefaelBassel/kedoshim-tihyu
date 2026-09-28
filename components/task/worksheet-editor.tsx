"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskSection, QuestionBlock } from "@/content/tasks/types";
import type { WorksheetEdits, UnitEdits } from "@/lib/content-overrides";
import SaveButton from "@/components/save-button";

// The teacher's in-place editor for a unit's worksheet — everything on it
// is text she owns: the unit's title line (on the hub), each section's
// title and minutes, every intro / case / source / art caption, and every
// question (reword, hide, restore, add her own). The files stay the
// defaults; what she saves is stored per content ref and wins.
type BlockEdit = { title?: string; body?: string; text?: string; caption?: string };

export default function WorksheetEditor({
  contentRef,
  sections,
  onlySection,
  edits,
  unitEdits,
  unitMeta,
  onClose,
}: {
  contentRef: string;
  sections: TaskSection[]; // the ORIGINAL file sections (so hidden ones can be restored)
  onlySection?: string; // limit the editor to one section key
  edits: WorksheetEdits;
  unitEdits: UnitEdits;
  // the unit's title line — edited only on the hub (when the whole unit is shown)
  unitMeta?: { title: string; subtitle?: string; readingIntro?: string };
  onClose?: () => void;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(edits.hidden));
  const [prompts, setPrompts] = useState<Record<string, string>>({ ...edits.prompts });
  const [extra, setExtra] = useState(edits.extra.map((e) => ({ ...e })));
  const [secEdits, setSecEdits] = useState<UnitEdits["sections"]>({ ...unitEdits.sections });
  const [blockEdits, setBlockEdits] = useState<UnitEdits["blocks"]>({ ...unitEdits.blocks });
  const [meta, setMeta] = useState({
    title: unitEdits.title ?? "",
    subtitle: unitEdits.subtitle ?? "",
    readingIntro: unitEdits.readingIntro ?? "",
  });

  const snapshot = () =>
    JSON.stringify({
      h: [...hidden].sort(),
      p: prompts,
      x: extra,
      s: secEdits,
      b: blockEdits,
      m: meta,
    });
  const [saved, setSaved] = useState(() =>
    JSON.stringify({
      h: [...edits.hidden].sort(),
      p: edits.prompts,
      x: edits.extra,
      s: unitEdits.sections,
      b: unitEdits.blocks,
      m: { title: unitEdits.title ?? "", subtitle: unitEdits.subtitle ?? "", readingIntro: unitEdits.readingIntro ?? "" },
    })
  );
  const current = snapshot();
  const dirty = useMemo(() => current !== saved, [current, saved]);

  const shown = onlySection ? sections.filter((s) => s.key === onlySection) : sections;

  const putField = async (field: string, value: unknown) => {
    const res = await fetch("/api/content-overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentRef, field, value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "השמירה נכשלה");
    return data.value;
  };

  const save = async () => {
    const ws: WorksheetEdits = {
      hidden: [...hidden],
      prompts: Object.fromEntries(Object.entries(prompts).filter(([, v]) => v.trim())),
      extra: extra.filter((e) => e.prompt.trim()),
    };
    const unit: UnitEdits = {
      sections: secEdits,
      blocks: blockEdits,
      ...(meta.title.trim() ? { title: meta.title.trim() } : {}),
      ...(meta.subtitle.trim() ? { subtitle: meta.subtitle.trim() } : {}),
      ...(meta.readingIntro.trim() ? { readingIntro: meta.readingIntro.trim() } : {}),
    };
    const v = (await putField("worksheet", ws)) as WorksheetEdits;
    const u = (await putField("unit", unit)) as UnitEdits;
    setHidden(new Set(v.hidden));
    setPrompts(v.prompts);
    setExtra(v.extra);
    setSecEdits(u.sections);
    setBlockEdits(u.blocks);
    setMeta({ title: u.title ?? "", subtitle: u.subtitle ?? "", readingIntro: u.readingIntro ?? "" });
    setSaved(
      JSON.stringify({
        h: [...v.hidden].sort(),
        p: v.prompts,
        x: v.extra,
        s: u.sections,
        b: u.blocks,
        m: { title: u.title ?? "", subtitle: u.subtitle ?? "", readingIntro: u.readingIntro ?? "" },
      })
    );
    router.refresh();
  };

  const toggleHidden = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const setSec = (key: string, patch: { title?: string; minutes?: number }) =>
    setSecEdits((s) => ({ ...s, [key]: { ...(s[key] ?? {}), ...patch } }));
  const setBlock = (key: string, patch: BlockEdit) =>
    setBlockEdits((b) => ({ ...b, [key]: { ...(b[key] ?? {}), ...patch } }));

  const Field = ({
    label,
    value,
    original,
    onChange,
    rows = 2,
    onReset,
  }: {
    label: string;
    value: string | undefined;
    original: string;
    onChange: (v: string) => void;
    rows?: number;
    onReset: () => void;
  }) => (
    <div className="mb-2">
      <label className="block text-[10px] font-semibold text-[color:var(--primary)]/55">{label}</label>
      <textarea
        value={value ?? original}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-0.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-sm leading-6 outline-none focus:border-[color:var(--accent)]"
      />
      {value != null && value !== original && (
        <button type="button" onClick={onReset} className="text-[10px] font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--accent)]">
          ↺ לנוסח המקורי
        </button>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl border-2 border-[color:var(--primary)]/30 bg-[color:var(--card)] p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">
            ✏️ עריכת {onlySection ? "תת-המשימה" : "היחידה"}
          </p>
          <p className="text-xs text-[color:var(--foreground)]/60">
            כל טקסט כאן ניתן לשינוי. שאלה אפשר להסתיר (היא נשארת אפורה ואפשר להחזיר) או להוסיף
            משלך. מה שתשמרי — זה מה שהתלמידים יראו.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]/70 hover:border-[color:var(--accent)]">
            סגירת העריכה
          </button>
        )}
      </div>

      {/* the unit's title line — hub only */}
      {!onlySection && unitMeta && (
        <div className="mb-5 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3">
          <p className="mb-2 text-[11px] font-bold text-[color:var(--accent)]">כותרת היחידה</p>
          <Field label="כותרת" value={meta.title || undefined} original={unitMeta.title} rows={1} onChange={(v) => setMeta((m) => ({ ...m, title: v }))} onReset={() => setMeta((m) => ({ ...m, title: "" }))} />
          <Field label="תת-כותרת" value={meta.subtitle || undefined} original={unitMeta.subtitle ?? ""} rows={1} onChange={(v) => setMeta((m) => ({ ...m, subtitle: v }))} onReset={() => setMeta((m) => ({ ...m, subtitle: "" }))} />
          <Field label="שורת פתיחה מעל הפסוקים (למשימות ללא חלק א׳)" value={meta.readingIntro || undefined} original={unitMeta.readingIntro ?? ""} rows={2} onChange={(v) => setMeta((m) => ({ ...m, readingIntro: v }))} onReset={() => setMeta((m) => ({ ...m, readingIntro: "" }))} />
        </div>
      )}

      <div className="space-y-5">
        {shown.map((sec) => {
          const mine = extra.filter((e) => e.sectionKey === sec.key);
          const se = secEdits[sec.key] ?? {};
          let qIndex = 0;
          return (
            <div key={sec.key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3">
              {/* section header */}
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="block text-[10px] font-semibold text-[color:var(--primary)]/55">כותרת תת-המשימה</label>
                  <input
                    value={se.title ?? sec.title}
                    onChange={(e) => setSec(sec.key, { title: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-sm font-bold outline-none focus:border-[color:var(--accent)]"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] font-semibold text-[color:var(--primary)]/55">~דקות</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={se.minutes ?? sec.minutes ?? ""}
                    onChange={(e) => setSec(sec.key, { minutes: Number(e.target.value) || undefined })}
                    className="mt-0.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-sm outline-none focus:border-[color:var(--accent)]"
                  />
                </div>
              </div>

              <ul className="space-y-2">
                {sec.blocks.map((b) => {
                  if (b.type === "question") {
                    const q = b as QuestionBlock;
                    qIndex += 1;
                    const off = hidden.has(q.key);
                    return (
                      <li key={q.key} className={`rounded-xl border p-3 transition ${off ? "border-dashed border-[color:var(--border)] bg-[color:var(--card)] opacity-60" : "border-[color:var(--border)] bg-[color:var(--card)]"}`}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[color:var(--primary)]/60">
                            שאלה {qIndex} · {q.label}
                            {off && " · מוסתרת"}
                          </span>
                          <button type="button" onClick={() => toggleHidden(q.key)} className={`rounded-full px-3 py-0.5 text-[11px] font-bold transition ${off ? "bg-[color:var(--success)] text-white" : "border border-[color:var(--danger)]/50 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"}`}>
                            {off ? "↩ להחזיר" : "להסתיר"}
                          </button>
                        </div>
                        <textarea
                          value={prompts[q.key] ?? q.prompt}
                          onChange={(e) => setPrompts((p) => ({ ...p, [q.key]: e.target.value }))}
                          disabled={off}
                          rows={2}
                          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)] disabled:opacity-60"
                        />
                        {prompts[q.key] && prompts[q.key] !== q.prompt && (
                          <button type="button" onClick={() => setPrompts((p) => { const n = { ...p }; delete n[q.key]; return n; })} className="mt-1 text-[10px] font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--accent)]">
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
                  }
                  const be = blockEdits[b.key] ?? {};
                  const reset = (k: keyof BlockEdit) =>
                    setBlockEdits((all) => {
                      const n = { ...all };
                      const e = { ...(n[b.key] ?? {}) };
                      delete e[k];
                      if (Object.keys(e).length) n[b.key] = e;
                      else delete n[b.key];
                      return n;
                    });
                  if (b.type === "intro" || b.type === "case") {
                    return (
                      <li key={b.key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[color:var(--primary)]/60">{b.type === "intro" ? "📝 טקסט פתיחה" : "🎭 מקרה / דילמה"}</p>
                        {(b.title || b.type === "case") && (
                          <Field label="כותרת" value={be.title} original={b.title ?? ""} rows={1} onChange={(v) => setBlock(b.key, { title: v })} onReset={() => reset("title")} />
                        )}
                        <Field label="הטקסט" value={be.body} original={b.body} rows={4} onChange={(v) => setBlock(b.key, { body: v })} onReset={() => reset("body")} />
                      </li>
                    );
                  }
                  if (b.type === "source") {
                    return (
                      <li key={b.key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[color:var(--primary)]/60">📜 מקור</p>
                        <Field label="כותרת המקור" value={be.title} original={b.title} rows={1} onChange={(v) => setBlock(b.key, { title: v })} onReset={() => reset("title")} />
                        <Field label="הטקסט" value={be.text} original={b.text} rows={4} onChange={(v) => setBlock(b.key, { text: v })} onReset={() => reset("text")} />
                      </li>
                    );
                  }
                  if (b.type === "art") {
                    return (
                      <li key={b.key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[color:var(--primary)]/60">🎨 כיתוב לאיור ({b.art})</p>
                        <Field label="הכיתוב" value={be.caption} original={b.caption ?? ""} rows={2} onChange={(v) => setBlock(b.key, { caption: v })} onReset={() => reset("caption")} />
                      </li>
                    );
                  }
                  return null; // passages: the biblical text itself is never edited here
                })}
                {mine.map((e) => (
                  <li key={e.key} className="rounded-xl border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/5 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[color:var(--accent)]">✨ שאלה שלך</span>
                      <button type="button" onClick={() => setExtra((x) => x.filter((y) => y.key !== e.key))} className="rounded-full border border-[color:var(--danger)]/50 px-3 py-0.5 text-[11px] font-bold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10">
                        למחוק
                      </button>
                    </div>
                    <textarea
                      value={e.prompt}
                      onChange={(ev) => setExtra((x) => x.map((y) => (y.key === e.key ? { ...y, prompt: ev.target.value } : y)))}
                      rows={2}
                      placeholder="נוסח השאלה…"
                      className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]"
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setExtra((x) => [...x, { sectionKey: sec.key, key: `t-${sec.key}-${Date.now().toString(36)}`, prompt: "", label: "שאלה של המורה", icon: "thinking" }])}
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
            if (!window.confirm("לבטל את כל העריכות של היחידה הזו ולחזור לנוסח המקורי? (שאלת הדיון ומצגת החזרה נשארות)")) return;
            for (const field of ["worksheet", "unit"]) {
              await fetch("/api/content-overrides", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contentRef, field, reset: true }),
              });
            }
            router.refresh();
            onClose?.();
          }}
          className="text-xs font-semibold text-[color:var(--primary)]/50 hover:text-[color:var(--danger)]"
        >
          ↺ לנוסח המקורי של כל היחידה
        </button>
      </div>
    </div>
  );
}
