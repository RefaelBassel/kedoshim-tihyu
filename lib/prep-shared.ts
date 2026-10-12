// Pure helpers for the exam-prep pages (server and client alike).

// "מוכנה / מוכן / מוכנ/ה" — by the student's chosen form of address
export function readyWord(form: string | null | undefined) {
  return form === "f" ? "מוכנה" : form === "m" ? "מוכן" : "מוכנ/ה";
}

// whole days from today (Israel) to an exam date YYYY-MM-DD; null without a date
export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  const [y, mo, d] = today.split("-").map(Number);
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(y, mo - 1, d)) / 86_400_000);
}

export function countdownText(days: number | null): string | null {
  if (days == null || days < 0) return null;
  if (days === 0) return "המבחן היום — בהצלחה!";
  if (days === 1) return "המבחן מחר";
  return `עוד ${days} ימים למבחן`;
}
