"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ExamPulse, PulseStudent } from "@/lib/exam-pulse";
import { formatHebDateTime } from "@/lib/hebrew";
import { formatExamDate } from "@/lib/exam-export-shared";

// The "דופק כיתה" screen: big metrics, a readiness chart, the per-student
// table (sortable, readiness ascending by default) and the hardest practice
// items. Projection mode hides every name — only the metrics and the chart.

const REFRESH_MS = 60_000;
const REMINDER = "היי, ראיתי שעוד לא התחלת את ההכנה למבחן — זה מחכה לך ב'משימות'. בהצלחה!";

type SortKey = "name" | "klass" | "prep" | "prepPct" | "firstTry" | "lastAt" | "tasksPct" | "readiness";
const PREP_RANK = { none: 0, progress: 1, done: 2 } as const;
const PREP_LABEL = { none: "לא התחיל", progress: "בתהליך", done: "סיים" } as const;
const TASK_LABEL = { none: "לא התחיל", progress: "בתהליך", submitted: "הוגש" } as const;
const TASK_DOT = { none: "#c9bfb5", progress: "var(--warning)", submitted: "var(--success)" } as const;

function band(pct: number) {
  if (pct >= 75) return { key: "green", label: "מוכנים", color: "var(--success)", icon: "✅" } as const;
  if (pct >= 40) return { key: "yellow", label: "בדרך", color: "var(--warning)", icon: "⏳" } as const;
  return { key: "red", label: "צריכים חיזוק", color: "var(--danger)", icon: "⚠️" } as const;
}

export default function ExamPulseView({ pulse }: { pulse: ExamPulse }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [projection, setProjection] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "readiness", dir: 1 });

  useEffect(() => {
    const iv = setInterval(() => startRefresh(() => router.refresh()), REFRESH_MS);
    return () => clearInterval(iv);
  }, [router]);

  const n = pulse.students.length;
  const countdown =
    pulse.daysLeft == null
      ? "לא נקבע תאריך"
      : pulse.daysLeft < 0
        ? "המבחן כבר עבר"
        : pulse.daysLeft === 0
          ? "היום!"
          : pulse.daysLeft === 1
            ? "מחר"
            : `עוד ${pulse.daysLeft} ימים`;

  const buckets = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const s of pulse.students) c[band(s.readiness).key]++;
    return c;
  }, [pulse.students]);

  const sorted = useMemo(() => {
    const val = (s: PulseStudent): string | number => {
      switch (sort.key) {
        case "name":
          return s.name;
        case "klass":
          return s.klass ?? "";
        case "prep":
          return PREP_RANK[s.prepStatus];
        case "lastAt":
          return s.lastAt ?? 0;
        default:
          return s[sort.key];
      }
    };
    return [...pulse.students].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const d = typeof va === "string" ? va.localeCompare(String(vb), "he") : va - (vb as number);
      return d * sort.dir || a.name.localeCompare(b.name, "he");
    });
  }, [pulse.students, sort]);

  const th = (key: SortKey, label: string) => (
    <th className="px-2 py-2 text-start">
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className={`whitespace-nowrap font-bold hover:text-[color:var(--accent)] ${sort.key === key ? "text-[color:var(--accent)]" : ""}`}
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[color:var(--primary)]/60">
          {refreshing ? "⏳ מרעננת…" : `עודכן ${formatHebDateTime(pulse.generatedAt)} · רענון אוטומטי כל דקה`}
          {!pulse.hasPrep ? " · עוד אין דף הכנה למבחן הזה" : !pulse.prepPublished ? " · דף ההכנה עדיין טיוטה, מוסתר מהתלמידים" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            className="rounded-full border-2 border-[color:var(--primary)]/40 px-4 py-1.5 text-sm font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 disabled:opacity-50"
          >
            {refreshing ? "מרעננת…" : "🔄 רענון"}
          </button>
          <button
            type="button"
            onClick={() => setProjection((p) => !p)}
            aria-pressed={projection}
            className={`rounded-full px-4 py-1.5 text-sm font-bold shadow transition ${
              projection ? "bg-[color:var(--accent)] text-white" : "bg-[color:var(--primary)] text-white hover:scale-[1.02]"
            }`}
          >
            {projection ? "✓ מצב הקרנה פעיל — חזרה לתצוגה המלאה" : "📽️ מצב הקרנה"}
          </button>
        </div>
      </div>

      {/* big metrics */}
      <div className={`grid grid-cols-2 gap-4 lg:grid-cols-4 ${projection ? "text-lg" : ""}`}>
        <Metric label="התחילו את דף ההכנה" value={`${pulse.started} / ${n}`} />
        <Metric label="סיימו את דף ההכנה" value={`${pulse.completed} / ${n}`} />
        <Metric label="ממוצע ההתקדמות בדף ההכנה" value={`${pulse.avgPrepPct}%`} />
        <Metric
          label={pulse.examDate ? `עד המבחן · ${formatExamDate(pulse.examDate)}` : "עד המבחן"}
          value={countdown}
          small={pulse.daysLeft == null}
        />
      </div>

      {/* readiness distribution */}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--primary)]">📊 מוכנות הכיתה</h2>
        {n === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/60">עוד אין תלמידים מאושרים.</p>
        ) : (
          <ReadinessChart buckets={buckets} total={n} />
        )}
        <p className="mt-3 text-[11px] text-[color:var(--primary)]/55">
          מוכנות = {pulse.hasPrep && pulse.tasks.length ? "50% דף ההכנה ו-50% משימות החזרה של הפרק" : pulse.hasPrep ? "דף ההכנה" : "משימות החזרה של הפרק"} · אדום מתחת ל-40%, צהוב 40%–74%, ירוק מ-75%
        </p>
      </section>

      {!projection && (
        <>
          {/* per-student table */}
          <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
            <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--primary)]">👥 התלמידים</h2>
            {n === 0 ? (
              <p className="text-sm text-[color:var(--foreground)]/60">עוד אין תלמידים מאושרים.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[color:var(--border)] text-xs text-[color:var(--primary)]/70">
                    <tr>
                      {th("name", "שם")}
                      {th("klass", "כיתה")}
                      {th("prep", "דף ההכנה")}
                      {th("prepPct", "% תרגול")}
                      {th("firstTry", "נכון בניסיון ראשון")}
                      {th("lastAt", "פעילות אחרונה")}
                      {th("tasksPct", "משימות הפרק")}
                      {th("readiness", "מוכנות")}
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((s) => {
                      const b = band(s.readiness);
                      return (
                        <tr key={s.userId} className="border-b border-[color:var(--border)]/60 last:border-0">
                          <td className="px-2 py-2 font-semibold text-[color:var(--primary)]">{s.name}</td>
                          <td className="px-2 py-2">{s.klass ?? "—"}</td>
                          <td className="px-2 py-2">
                            {pulse.hasPrep ? (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                                style={{
                                  color: s.prepStatus === "done" ? "var(--success)" : s.prepStatus === "progress" ? "var(--warning)" : "#6b6055",
                                  background: s.prepStatus === "done" ? "#e5efe8" : s.prepStatus === "progress" ? "#fdf3d7" : "#f0e9e1",
                                }}
                              >
                                {PREP_LABEL[s.prepStatus]}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{pulse.hasPrep ? `${s.prepPct}%` : "—"}</td>
                          <td className="px-2 py-2 tabular-nums">{pulse.hasPrep ? `${s.firstTry} / ${pulse.practiceCount}` : "—"}</td>
                          <td className="px-2 py-2 text-xs text-[color:var(--primary)]/70">{s.lastAt ? formatHebDateTime(s.lastAt) : "—"}</td>
                          <td className="px-2 py-2">
                            {pulse.tasks.length === 0 ? (
                              <span className="text-xs text-[color:var(--primary)]/50">אין משימות שפורסמו</span>
                            ) : (
                              <span className="flex items-center gap-1">
                                {s.tasks.map((t, i) => (
                                  <span
                                    key={pulse.tasks[i].id}
                                    title={`${pulse.tasks[i].title} — ${TASK_LABEL[t.state]} · ${t.pct}%`}
                                    aria-label={`${pulse.tasks[i].title} — ${TASK_LABEL[t.state]} · ${t.pct}%`}
                                    className="inline-block h-3.5 w-3.5 cursor-help rounded-full"
                                    style={{ background: TASK_DOT[t.state] }}
                                  />
                                ))}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white tabular-nums" style={{ background: b.color }} title={b.label}>
                              {s.readiness}%
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {pulse.prepPublished && s.prepStatus === "none" && (
                              <Link
                                href={`/messages?to=${s.userId}&draft=${encodeURIComponent(REMINDER)}`}
                                className="whitespace-nowrap rounded-full border border-[color:var(--accent)]/60 px-3 py-1 text-xs font-bold text-[color:var(--accent)] transition hover:bg-[color:var(--accent)]/10"
                              >
                                💬 תזכורת
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {pulse.tasks.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--primary)]/60">
                {(["none", "progress", "submitted"] as const).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TASK_DOT[k] }} /> {TASK_LABEL[k]}
                  </span>
                ))}
                <span>· העבירו את העכבר על עיגול כדי לראות את המשימה ואת אחוז ההתקדמות</span>
              </p>
            )}
          </section>

          {/* hardest practice items */}
          {pulse.hasPrep && (
            <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
              <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--primary)]">🧗 פריטי תרגול קשים</h2>
              <p className="mb-3 text-xs text-[color:var(--primary)]/60">אחוז ההצלחה הנמוך ביותר בניסיון הראשון — אולי כדאי לחזור עליהם בכיתה</p>
              {pulse.hardItems.length === 0 ? (
                <p className="text-sm text-[color:var(--foreground)]/60">עוד אין מספיק תשובות כדי לדעת.</p>
              ) : (
                <ol className="space-y-2">
                  {pulse.hardItems.map((h, i) => (
                    <li key={h.id} className="flex items-start gap-3 rounded-xl bg-[color:var(--background)] px-4 py-2.5 text-sm">
                      <span className="font-display font-extrabold text-[color:var(--accent)]">{i + 1}.</span>
                      <span className="flex-1 leading-6">{h.text}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: band(h.firstTryRate).color }}>
                        {h.firstTryRate}% <span className="font-normal text-[color:var(--primary)]/55">({h.tried} ענו)</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}

      <p className="text-center text-xs text-[color:var(--primary)]/50">
        <Link href={`/dashboard/exams/${pulse.examId}`} className="hover:text-[color:var(--accent)]">
          → למבחן ולדף ההכנה
        </Link>
        {" · "}
        <Link href="/dashboard/exams" className="hover:text-[color:var(--accent)]">
          כל המבחנים
        </Link>
      </p>
    </div>
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 text-center">
      <p className={`font-display font-extrabold text-[color:var(--primary)] tabular-nums ${small ? "text-2xl" : "text-4xl"}`}>{value}</p>
      <p className="mt-1 text-xs text-[color:var(--primary)]/60">{label}</p>
    </div>
  );
}

// three bars — red / yellow / green — each labeled with its band and count
function ReadinessChart({ buckets, total }: { buckets: { red: number; yellow: number; green: number }; total: number }) {
  const bands = [band(0), band(50), band(100)];
  const max = Math.max(1, buckets.red, buckets.yellow, buckets.green);
  return (
    <div className="grid grid-cols-3 gap-4">
      {bands.map((b) => {
        const count = buckets[b.key];
        return (
          <div key={b.key} className="flex flex-col items-center" title={`${b.label}: ${count} מתוך ${total}`}>
            <span className="mb-1 font-display text-2xl font-extrabold text-[color:var(--primary)] tabular-nums">{count}</span>
            <div className="flex h-40 w-full max-w-[120px] items-end border-b border-[color:var(--border)]">
              <div className="w-full rounded-t" style={{ height: `${(100 * count) / max}%`, minHeight: count ? 4 : 0, background: b.color }} />
            </div>
            <span className="mt-2 text-sm font-bold text-[color:var(--primary)]">
              {b.icon} {b.label}
            </span>
            <span className="text-[11px] text-[color:var(--primary)]/55">{Math.round((100 * count) / total)}% מהכיתה</span>
          </div>
        );
      })}
    </div>
  );
}
