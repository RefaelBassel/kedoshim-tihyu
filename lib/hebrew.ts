// Hebrew date/time helpers. UI shows Hebrew months with Gregorian parallel.

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// Hebrew dates use HEBREW NUMERALS (כ"ד באב תשפ"ו), never digit years like
// "5786" (Rafael, 2026-08-06). Node's ICU ignores the nu-hebr numbering
// system, so we convert with our own gematria helper.
const G_ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const G_TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const G_HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

// n in 1..999 → Hebrew numeral with geresh/gershayim (15→ט״ו, 16→ט״ז).
export function gematria(n: number): string {
  let s = G_HUNDREDS[Math.floor(n / 100)] ?? "";
  const r = n % 100;
  if (r === 15) s += "טו";
  else if (r === 16) s += "טז";
  else s += (G_TENS[Math.floor(r / 10)] ?? "") + (G_ONES[r % 10] ?? "");
  if (s.length === 0) return String(n);
  if (s.length === 1) return s + "׳";
  return s.slice(0, -1) + "״" + s.slice(-1);
}

function hebrewParts(d: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayNum = parseInt(get("day"), 10);
  const yearNum = parseInt(get("year"), 10);
  return {
    day: Number.isFinite(dayNum) ? gematria(dayNum) : get("day"),
    month: get("month"),
    year: Number.isFinite(yearNum) ? gematria(yearNum % 1000) : get("year"),
  };
}

export function formatHebDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const h = hebrewParts(d);
  const greg = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
  }).format(d);
  return `${h.day} ב${h.month} (${greg})`;
}

export function formatFullDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const day = DAY_NAMES[d.getDay()];
  const h = hebrewParts(d);
  const greg = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
  return `יום ${day}, ${h.day} ב${h.month} ${h.year} · ${greg} · ${formatHebTime(unixSeconds)}`;
}

// "23:59" — the clock time of a due date, Israel time.
export function formatHebTime(unixSeconds: number): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(unixSeconds * 1000));
}

// "כ״ד באב (17.8) · 23:59"
export function formatHebDateTime(unixSeconds: number): string {
  return `${formatHebDate(unixSeconds)} · ${formatHebTime(unixSeconds)}`;
}

// The teacher enters due dates as a calendar day + clock time in Israel;
// convert to a unix timestamp honouring Israel's DST for THAT date (not a
// hard-coded +03:00).
export function israelLocalToUnix(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  // offset of Asia/Jerusalem at (approximately) that instant
  const probe = new Date(asUtc - 2 * 3600 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(probe);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = localAsUtc - probe.getTime();
  return Math.floor((asUtc - offsetMs) / 1000);
}

export function formatWorkTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Strip nikud + taamim for word comparison (leitwort matching).
export function stripNikud(text: string): string {
  return text.replace(/[֑-ׇ]/g, "");
}
