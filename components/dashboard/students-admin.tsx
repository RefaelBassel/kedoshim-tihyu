"use client";

import { useState, useTransition } from "react";
import type { AccountRow } from "@/lib/approval";
import {
  approveAction,
  blockAction,
  makeStudentAction,
  mergeAction,
  mergePreviewAction,
  makeTeacherAction,
  preApproveAction,
  removeAction,
  unblockAction,
} from "@/app/dashboard/students/actions";
import { TEACHER_EMAILS } from "@/lib/roles";

// The roster UI. Every row shows the Hebrew name (if onboarded), the Google
// email, when the account appeared and when it was last seen — enough to
// tell a classmate from a stranger. Actions are immediate, with a visible
// working state; removal asks for confirmation and deletes everything.
function fmt(ts: number | null) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(ts * 1000));
}

export default function StudentsAdmin({
  pending,
  approved,
  blocked,
  teachers,
}: {
  pending: AccountRow[];
  approved: AccountRow[];
  blocked: AccountRow[];
  teachers: AccountRow[];
}) {
  // every student account, for the "merge with…" picker
  const students = [...approved, ...pending, ...blocked].filter((a) => a.role !== "teacher");
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PreApprove />

      <Group
        title={`⏳ ממתינים לאישור (${pending.length})`}
        tone="warning"
        empty="אין חשבונות שממתינים — כל מי שנכנס כבר אושר או הוסר."
        rows={pending}
        actions={(a) => (
          <>
            <ActionBtn label="✓ אישור" tone="success" run={() => approveAction(a.id)} />
            <MergeBtn account={a} students={students} />
            <ActionBtn
              label="✗ הסרה"
              tone="danger"
              confirm={`להסיר את ${a.fullName ?? a.email} מהאתר לצמיתות? לא מהכיתה — לא נשאר כלום.`}
              run={() => removeAction(a.id)}
            />
          </>
        )}
      />

      <Group
        title={`✅ מאושרים (${approved.length})`}
        tone="success"
        empty="עוד אין תלמידים מאושרים."
        rows={approved}
        actions={(a) => (
          <>
            <MergeBtn account={a} students={students} />
            <ActionBtn
              label="👩‍🏫 זו מורה"
              tone="muted"
              confirm={`לסמן את ${a.fullName ?? a.email} כמורה? החשבון ייצא מכל רשימות התלמידות (הקצאות, כרטיסי כניסה, השלמות) ויקבל את מסכי המורה.`}
              run={() => makeTeacherAction(a.id)}
            />
            <ActionBtn
              label="חסימה"
              tone="muted"
              confirm={`לחסום את ${a.fullName ?? a.email}? העבודה נשמרת, אבל הכניסה נסגרת עד לביטול החסימה.`}
              run={() => blockAction(a.id)}
            />
            <ActionBtn
              label="✗ הסרה"
              tone="danger"
              confirm={`להסיר את ${a.fullName ?? a.email} לצמיתות, כולל כל מה ששמר/ה באתר? הפעולה לא הפיכה.`}
              run={() => removeAction(a.id)}
            />
          </>
        )}
      />

      {blocked.length > 0 && (
        <Group
          title={`🔒 חסומים (${blocked.length})`}
          tone="danger"
          empty=""
          rows={blocked}
          actions={(a) => (
            <>
              <ActionBtn label="ביטול חסימה" tone="success" run={() => unblockAction(a.id)} />
              <MergeBtn account={a} students={students} />
              <ActionBtn
                label="✗ הסרה"
                tone="danger"
                confirm={`להסיר את ${a.fullName ?? a.email} לצמיתות?`}
                run={() => removeAction(a.id)}
              />
            </>
          )}
        />
      )}

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
        <p className="mb-1 text-xs font-bold text-[color:var(--primary)]/60">👩‍🏫 מורות (מאושרות תמיד, לא מופיעות באף רשימת תלמידות)</p>
        <p className="mb-3 text-[11px] text-[color:var(--primary)]/50">חשבון של מורה שנכנס עם כתובת גוגל אחרת נראה כמו תלמידה — מסמנים אותו ״זו מורה״ ברשימת המאושרים.</p>
        <ul className="space-y-1.5 text-sm">
          {teachers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{t.fullName ?? t.email}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-[color:var(--primary)]/55" dir="ltr">
                  {t.email}
                </span>
                {!TEACHER_EMAILS.has(t.email.toLowerCase()) && (
                  <ActionBtn label="בחזרה לתלמידה" tone="muted" confirm={`להחזיר את ${t.fullName ?? t.email} לתלמידה?`} run={() => makeStudentAction(t.id)} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Group({
  title,
  tone,
  empty,
  rows,
  actions,
}: {
  title: string;
  tone: "warning" | "success" | "danger";
  empty: string;
  rows: AccountRow[];
  actions: (a: AccountRow) => React.ReactNode;
}) {
  const border =
    tone === "warning"
      ? "border-[color:var(--warning)]/50"
      : tone === "danger"
        ? "border-[color:var(--danger)]/40"
        : "border-[color:var(--border)]";
  return (
    <section className={`rounded-2xl border-2 bg-[color:var(--card)] p-5 ${border}`}>
      <h2 className="mb-3 font-display text-lg font-extrabold text-[color:var(--primary)]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--foreground)]/55">{empty}</p>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[color:var(--foreground)]">
                  {a.fullName ?? <span className="text-[color:var(--warning)]">(עוד לא הזין/ה שם)</span>}
                  {a.hasWork && (
                    <span className="ms-2 rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--primary)]">
                      יש עבודה שמורה
                    </span>
                  )}
                </p>
                <p className="text-xs text-[color:var(--primary)]/60">
                  <span dir="ltr">{a.email}</span>
                  {" · "}נכנס/ה לראשונה {fmt(a.createdAt)}
                  {" · "}נראה/תה לאחרונה {fmt(a.lastSeenAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">{actions(a)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionBtn({
  label,
  tone,
  confirm,
  run,
}: {
  label: string;
  tone: "success" | "danger" | "muted";
  confirm?: string;
  run: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const cls =
    tone === "success"
      ? "bg-[color:var(--success)] text-white"
      : tone === "danger"
        ? "border border-[color:var(--danger)]/50 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
        : "border border-[color:var(--border)] text-[color:var(--primary)]/75 hover:border-[color:var(--accent)]";
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setErr(null);
          start(async () => {
            const r = await run();
            if (!r.ok) setErr(r.error ?? "משהו השתבש");
          });
        }}
        className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${cls} ${busy ? "scale-95" : ""}`}
      >
        {busy ? "…" : label}
      </button>
      {err && <span className="mt-0.5 text-[10px] text-[color:var(--danger)]">{err}</span>}
    </span>
  );
}

// "Merge with another account…": a student who signed in with two Google
// addresses. The teacher picks the account that stays and the one merged
// into it, sees a summary of what moves, then confirms.
function MergeBtn({ account, students }: { account: AccountRow; students: AccountRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-bold text-[color:var(--primary)]/75 transition hover:border-[color:var(--accent)]"
      >
        איחוד עם חשבון אחר…
      </button>
      {open && <MergeDialog account={account} students={students} onClose={() => setOpen(false)} />}
    </>
  );
}

const accLabel = (a: AccountRow) => `${a.fullName ?? "(בלי שם)"} · ${a.email}`;

function MergeDialog({
  account,
  students,
  onClose,
}: {
  account: AccountRow;
  students: AccountRow[];
  onClose: () => void;
}) {
  // the other account defaults to one with the same name, if there is one
  const twin = students.find(
    (s) => s.id !== account.id && account.fullName && s.fullName?.trim() === account.fullName.trim()
  );
  const [keepId, setKeepId] = useState(account.id);
  const [mergedId, setMergedId] = useState<number | null>(twin?.id ?? null);
  const [lines, setLines] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);
  const [loading, startPreview] = useTransition();
  const [merging, startMerge] = useTransition();

  const pick = (keep: number, other: number | null) => {
    setKeepId(keep);
    setMergedId(other);
    setLines(null);
    setErr(null);
  };
  const preview = () =>
    startPreview(async () => {
      if (mergedId == null) return;
      const r = await mergePreviewAction(keepId, mergedId);
      if (r.ok) setLines(r.lines);
      else setErr(r.error);
    });
  const select =
    "w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !merging && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[color:var(--card)] p-5 text-start shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-display text-lg font-extrabold text-[color:var(--primary)]">איחוד חשבונות כפולים</h3>
        <p className="mb-4 text-xs text-[color:var(--foreground)]/60">
          כל העבודה של החשבון שמתמזג עוברת לחשבון שנשאר. משימה שעבדו עליה בשני החשבונות — נשמרת הגרסה
          המתקדמת יותר (הוגש, ואחר כך אחוז התקדמות), והשנייה נשמרת בארכיון. החשבון שמתמזג יוצא מהרשימות,
          וכניסה איתו מובילה לחשבון שנשאר.
        </p>

        {merged ? (
          <div className="space-y-3">
            <p className="text-sm font-bold text-[color:var(--success)]">✓ החשבונות אוחדו</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-[color:var(--primary)] px-4 py-1.5 text-xs font-bold text-white"
            >
              סגירה
            </button>
          </div>
        ) : (
          <>
            <label className="mb-1 block text-xs font-bold text-[color:var(--primary)]/70">החשבון שנשאר</label>
            <select
              value={keepId}
              onChange={(e) => {
                const k = Number(e.target.value);
                pick(k, mergedId === k ? null : mergedId);
              }}
              className={select}
              dir="auto"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {accLabel(s)}
                </option>
              ))}
            </select>

            <div className="my-2 flex justify-center">
              <button
                type="button"
                disabled={mergedId == null}
                onClick={() => mergedId != null && pick(mergedId, keepId)}
                className="rounded-full border border-[color:var(--border)] px-3 py-0.5 text-xs font-bold text-[color:var(--primary)]/70 transition hover:border-[color:var(--accent)] disabled:opacity-40"
              >
                ⇅ החלפה
              </button>
            </div>

            <label className="mb-1 block text-xs font-bold text-[color:var(--primary)]/70">החשבון שמתמזג אליו (ייצא מהרשימות)</label>
            <select
              value={mergedId ?? ""}
              onChange={(e) => pick(keepId, e.target.value ? Number(e.target.value) : null)}
              className={select}
              dir="auto"
            >
              <option value="">— בחירת חשבון —</option>
              {students
                .filter((s) => s.id !== keepId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {accLabel(s)}
                  </option>
                ))}
            </select>

            {lines && (
              <ul className="mt-4 space-y-1.5 rounded-xl border border-[color:var(--warning)]/50 bg-[color:var(--warning)]/5 p-3 text-xs leading-5">
                {lines.map((l, i) => (
                  <li key={i}>• {l}</li>
                ))}
              </ul>
            )}
            {err && <p className="mt-2 text-xs font-semibold text-[color:var(--danger)]">{err}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!lines ? (
                <button
                  type="button"
                  disabled={mergedId == null || loading}
                  onClick={preview}
                  className="rounded-full bg-[color:var(--primary)] px-4 py-1.5 text-xs font-bold text-white transition disabled:opacity-40"
                >
                  {loading ? "בודק מה יעבור…" : "הצגת סיכום לפני איחוד"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={merging || mergedId == null}
                  onClick={() =>
                    startMerge(async () => {
                      if (mergedId == null) return;
                      setErr(null);
                      const r = await mergeAction(keepId, mergedId);
                      if (r.ok) setMerged(true);
                      else setErr(r.error ?? "משהו השתבש");
                    })
                  }
                  className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  {merging ? "מאחד…" : "✓ אישור ואיחוד"}
                </button>
              )}
              <button
                type="button"
                disabled={merging}
                onClick={onClose}
                className="rounded-full border border-[color:var(--border)] px-4 py-1.5 text-xs font-bold text-[color:var(--primary)]/70 disabled:opacity-40"
              >
                ביטול
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Pre-approve by email: paste the class list once and everyone walks in on
// first sign-in, no waiting.
function PreApprove() {
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <p className="font-display text-base font-bold text-[color:var(--primary)]">
        ➕ אישור מראש לפי מייל
      </p>
      <p className="mb-2 text-xs text-[color:var(--foreground)]/60">
        הדביקי כתובות גוגל של תלמידי הכיתה (מופרדות ברווח, פסיק או שורה). מי שברשימה ייכנס
        ישר, בלי להמתין לאישור.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        dir="ltr"
        placeholder="name1@gmail.com, name2@school.org.il"
        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !text.includes("@")}
          onClick={() =>
            start(async () => {
              const r = await preApproveAction(text);
              setMsg(r.ok ? `נוספו ${r.added} כתובות ✓` : (r.error ?? "משהו השתבש"));
              if (r.ok) setText("");
            })
          }
          className="rounded-full bg-[color:var(--primary)] px-4 py-1.5 text-xs font-bold text-white transition disabled:opacity-40"
        >
          {busy ? "מוסיף…" : "הוספה לרשימה המאושרת"}
        </button>
        {msg && <span className="text-xs font-semibold text-[color:var(--success)]">{msg}</span>}
      </div>
    </section>
  );
}
