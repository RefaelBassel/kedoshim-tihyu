"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import StudentName from "@/components/student-name";
import { EMPTY_PROGRESS_PCT, MIN_ANSWERS, skillLevel, type SkillLevel, type SkillsReport, type SkillStudent } from "@/lib/skills-map";

// Skills report (issue #29): a row per student, a column per skill group — the
// mean of the lenient answer checks and, in brackets, how many answers it rests
// on. A click on a cell opens those answers with the score and the note.
// Teacher only.

const LEVEL_STYLE: Record<SkillLevel, string> = {
  red: "bg-[#f9e5e3] text-[#9d3438]",
  yellow: "bg-[#fdf3d7] text-[#8a6516]",
  green: "bg-[#e5efe8] text-[#3e6b4f]",
  grey: "bg-[#f0e9e1] text-[#6b6055]",
};

type SortKey = "name" | "submitted" | "minutes" | "empty" | "strongest" | "weakest" | `skill:${string}`;

export interface SkillsFilterState {
  ref: string;
  from: string;
  to: string;
}

export default function SkillsReportView({
  report,
  units,
  filter,
}: {
  report: SkillsReport;
  units: { ref: string; title: string }[];
  filter: SkillsFilterState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ref, setRef] = useState(filter.ref);
  const [from, setFrom] = useState(filter.from);
  const [to, setTo] = useState(filter.to);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [open, setOpen] = useState<{ userId: number; group: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const title = (key: string | null) => report.groups.find((g) => g.key === key)?.title ?? "";

  const apply = () => {
    const p = new URLSearchParams();
    if (ref) p.set("ref", ref);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    startTransition(() => router.push(`/dashboard/skills${qs ? `?${qs}` : ""}`));
  };
  const clear = () => {
    setRef("");
    setFrom("");
    setTo("");
    startTransition(() => router.push("/dashboard/skills"));
  };

  const rows = useMemo(() => {
    const val = (s: SkillStudent): number | string | null => {
      if (sort.key === "name") return s.name;
      if (sort.key === "submitted") return s.due ? s.submitted / s.due : null;
      if (sort.key === "minutes") return s.avgMinutes;
      if (sort.key === "empty") return s.emptySubmissions;
      if (sort.key === "strongest") return s.strongest ? s.cells[s.strongest].avg : null;
      if (sort.key === "weakest") return s.weakest ? s.cells[s.weakest].avg : null;
      const c = s.cells[sort.key.slice(6)];
      return c && c.n >= MIN_ANSWERS ? c.avg : null;
    };
    return [...report.students].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return a.name.localeCompare(b.name, "he");
      if (x == null) return 1; // no data always last
      if (y == null) return -1;
      const d = typeof x === "string" ? x.localeCompare(String(y), "he") : Number(x) - Number(y);
      return d * sort.dir || a.name.localeCompare(b.name, "he");
    });
  }, [report.students, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  const exportCsv = () => {
    setExporting(true);
    try {
      const cell = (v: unknown) => {
        const t = v == null ? "" : String(v);
        return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const head = ["שם", "כיתה", ...report.groups.flatMap((g) => [`${g.title} — ממוצע`, `${g.title} — מספר שאלות`]), "הוגשו", "מועדם עבר", "דקות עבודה בממוצע", "הגשות ריקות", "חוזקה", "לחיזוק"];
      const lines = rows.map((s) => [
        s.name,
        s.klass ?? "",
        ...report.groups.flatMap((g) => {
          const c = s.cells[g.key];
          return [c.n >= MIN_ANSWERS ? c.avg : c.avg != null ? `${c.avg} (מעט נתונים)` : "", c.n];
        }),
        s.submitted,
        s.due,
        s.avgMinutes ?? "",
        s.emptySubmissions,
        title(s.strongest),
        title(s.weakest),
      ]);
      const cls = ["ממוצע כיתתי", "", ...report.groups.flatMap((g) => [report.classCells[g.key].avg ?? "", report.classCells[g.key].n]), "", "", "", "", "", ""];
      const csv = "﻿" + [head, ...lines, cls].map((l) => l.map(cell).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "דוח-מיומנויות.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setExporting(false), 600);
    }
  };

  const openStudent = open ? report.students.find((s) => s.userId === open.userId) ?? null : null;
  const openCell = openStudent && open ? openStudent.cells[open.group] : null;
  const th = "px-2 py-2 text-start cursor-pointer select-none whitespace-nowrap hover:text-[color:var(--accent)]";

  return (
    <div className="space-y-5">
      {/* filter */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--primary)]/70">יחידה</span>
            <select value={ref} onChange={(e) => setRef(e.target.value)} className="rounded-lg border border-[color:var(--border)] bg-white px-2 py-1.5">
              <option value="">כל היחידות</option>
              {units.map((u) => (
                <option key={u.ref} value={u.ref}>
                  {u.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--primary)]/70">מועד הגשה מ־</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-[color:var(--border)] bg-white px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--primary)]/70">עד</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-[color:var(--border)] bg-white px-2 py-1.5" />
          </label>
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="rounded-full bg-[color:var(--primary)] px-5 py-1.5 font-bold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {pending ? "מעדכן…" : "הצגה"}
          </button>
          {(filter.ref || filter.from || filter.to) && (
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="rounded-full border-2 border-[color:var(--primary)]/40 px-4 py-1.5 font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 active:scale-95 disabled:opacity-50"
            >
              ניקוי סינון
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-[color:var(--foreground)]/60">
          מבוסס על {report.tasks.length} משימות שפורסמו. הציון של כל שאלה הוא הבדיקה המקלה של קלוד (0–100); שאלות שלא נענו או שעוד לא נבדקו אינן נכנסות לממוצע
          {report.unchecked > 0 && ` — ${report.unchecked} תשובות עדיין לא נבדקו`}. תא עם פחות מ-{MIN_ANSWERS} שאלות נראה באפור. אדום מתחת ל-55, צהוב 55–74, ירוק 75 ומעלה.
        </p>
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[color:var(--primary)]">🧭 מיומנויות לפי תלמיד {pending && <span className="text-xs font-normal text-[color:var(--primary)]/50">· מתעדכן…</span>}</h2>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0 || exporting}
            className="rounded-full border-2 border-[color:var(--primary)]/40 px-4 py-1.5 text-sm font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 active:scale-95 disabled:opacity-40"
          >
            {exporting ? "מייצא…" : "⬇️ ייצוא ל-Excel/CSV"}
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/60">עוד אין תלמידים מאושרים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--border)] text-xs text-[color:var(--primary)]/70">
                <tr>
                  <th className={th} onClick={() => toggleSort("name")}>
                    שם{arrow("name")}
                  </th>
                  {report.groups.map((g) => (
                    <th key={g.key} className={th} onClick={() => toggleSort(`skill:${g.key}`)}>
                      {g.title}
                      {arrow(`skill:${g.key}`)}
                    </th>
                  ))}
                  <th className={th} onClick={() => toggleSort("submitted")} title="משימות שהוגשו מתוך אלה שהמועד שלהן עבר">
                    הוגשו{arrow("submitted")}
                  </th>
                  <th className={th} onClick={() => toggleSort("minutes")} title="דקות עבודה בממוצע להגשה">
                    דקות להגשה{arrow("minutes")}
                  </th>
                  <th className={th} onClick={() => toggleSort("empty")} title={`הגשות עם התקדמות של עד ${EMPTY_PROGRESS_PCT}%`}>
                    הגשות ריקות{arrow("empty")}
                  </th>
                  <th className={th} onClick={() => toggleSort("strongest")}>
                    חוזקה{arrow("strongest")}
                  </th>
                  <th className={th} onClick={() => toggleSort("weakest")}>
                    לחיזוק{arrow("weakest")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.userId} className="border-b border-[color:var(--border)]/60">
                    <td className="whitespace-nowrap px-2 py-2 font-bold text-[color:var(--primary)]">
                      <StudentName name={s.name} />
                      {s.klass && <span className="ms-1 text-xs font-normal text-[color:var(--primary)]/50">{s.klass}</span>}
                    </td>
                    {report.groups.map((g) => {
                      const c = s.cells[g.key];
                      const level = skillLevel(c.avg, c.n);
                      if (c.n === 0) {
                        return (
                          <td key={g.key} className="px-1 py-1 text-center text-[color:var(--primary)]/30">
                            —
                          </td>
                        );
                      }
                      const active = open?.userId === s.userId && open.group === g.key;
                      return (
                        <td key={g.key} className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => setOpen(active ? null : { userId: s.userId, group: g.key })}
                            title={level === "grey" ? "מעט נתונים — פחות מ-3 שאלות" : "הצגת התשובות"}
                            className={`min-w-16 rounded-lg px-2 py-1 font-bold transition hover:opacity-80 active:scale-95 ${LEVEL_STYLE[level]} ${active ? "ring-2 ring-[color:var(--primary)]" : ""}`}
                          >
                            {c.avg} ({c.n})
                          </button>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-2 py-2 text-center">{s.due ? `${s.submitted} מתוך ${s.due}` : "—"}</td>
                    <td className="px-2 py-2 text-center">{s.avgMinutes ?? "—"}</td>
                    <td className={`px-2 py-2 text-center ${s.emptySubmissions > 0 ? "font-bold text-[#9d3438]" : ""}`}>{s.emptySubmissions}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-[#3e6b4f]">{title(s.strongest) || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-[#9d3438]">{title(s.weakest) || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[color:var(--primary)]/30 bg-[color:var(--background)]">
                  <td className="px-2 py-2 font-bold text-[color:var(--primary)]">ממוצע כיתתי</td>
                  {report.groups.map((g) => {
                    const c = report.classCells[g.key];
                    return (
                      <td key={g.key} className="px-1 py-2 text-center">
                        {c.avg == null ? (
                          <span className="text-[color:var(--primary)]/30">—</span>
                        ) : (
                          <span className={`inline-block min-w-16 rounded-lg px-2 py-1 font-bold ${LEVEL_STYLE[skillLevel(c.avg, c.n)]}`} title={`${c.students} תלמידים`}>
                            {c.avg} ({c.n})
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {openStudent && openCell && open && (
        <section className="rounded-2xl border-2 border-[color:var(--primary)]/30 bg-[color:var(--card)] p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display font-bold text-[color:var(--primary)]">
              {openStudent.name} · {title(open.group)} · ממוצע {openCell.avg} ({openCell.n} שאלות)
            </h3>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded-full border border-[color:var(--border)] px-3 py-1 text-sm transition hover:bg-black/5 active:scale-95"
            >
              ✕ סגירה
            </button>
          </div>
          <ul className="space-y-3">
            {openCell.answers.map((a, i) => (
              <li key={i} className="rounded-xl border border-[color:var(--border)] p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--primary)]/60">
                  <span>
                    {a.taskTitle} · {a.label}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${LEVEL_STYLE[a.score < 55 ? "red" : a.score < 75 ? "yellow" : "green"]}`}>{a.score}</span>
                </div>
                <p className="font-bold">{a.prompt}</p>
                <p className="mt-1 whitespace-pre-wrap">{a.answer}</p>
                <p className="mt-1 text-xs text-[color:var(--foreground)]/60">💬 {a.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
