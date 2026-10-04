// Measure the real input size of the three Claude calls the site makes, with
// the Messages count_tokens endpoint (free). Used to estimate running costs.
// Run: npx tsx scripts/count-assist-tokens.mts   (needs ANTHROPIC_API_KEY in .env.local)
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { TASK_REGISTRY } from "../content/tasks/registry";
import { CLAUDE_MODEL } from "../lib/claude";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// the student-help system prompt, read from the route source
const routeSrc = readFileSync("app/api/assist/route.ts", "utf8");
const sys = routeSrc.slice(routeSrc.indexOf("const SYSTEM_PROMPT = `") + 23, routeSrc.indexOf("`;\n\nexport async function POST"));

async function count(label: string, system: string, user: string, extra: { role: "user" | "assistant"; content: string }[] = []) {
  const r = await client.messages.countTokens({
    model: CLAUDE_MODEL,
    system,
    messages: [{ role: "user", content: user }, ...extra],
  });
  console.log(`${label.padEnd(44)} ${String(r.input_tokens).padStart(6)} input tokens`);
  return r.input_tokens;
}

const short = TASK_REGISTRY["vayikra-16-1"]; // 1 chapter passage
const long = TASK_REGISTRY["avshalom-3"]; // 2 chapters, 32 verses
const longest = TASK_REGISTRY["avshalom-4"]; // 41 verses

const passage = (reg: typeof short) => reg.mainPassage.verses.map((v) => `(${v.num}) ${v.text}`).join(" ");
const ctx = (reg: typeof short) =>
  `שם התלמיד/ה: נועה כהן — לפנייה מדי פעם בשם הפרטי בלבד, בלי להסיק מגדר.\n\nהיסטוריית עזרה כללית (להתאמת גובה העזרה):\n` +
  Array.from({ length: 6 }, (_, i) => `- הקשר: ${"שאלה על הפסוקים ".repeat(6).slice(0, 120)} | שאלה: ${"לא הבנתי מה זה אומר ".repeat(6).slice(0, 120)} | ענית: ${"נסו לקרוא שוב את הפסוק ולשים לב למילה ".repeat(3).slice(0, 120)}`).join("\n") +
  `\n\nההקשר הנוכחי במשימה:\nהקטע הנלמד — ${reg.mainPassage.ref}:\n${passage(reg)}\n\nשאלה: ${reg.content.sections[0].blocks[1] && "prompt" in reg.content.sections[0].blocks[1] ? (reg.content.sections[0].blocks[1] as { prompt: string }).prompt : ""}\nמה שכתבתי עד כה: (ריק)`;

console.log(`model: ${CLAUDE_MODEL}\n`);
console.log(`system prompt alone: ${sys.length} chars`);
await count("student help · first message · 1 chapter", sys, ctx(short), [{ role: "user", content: "לא הבנתי מה השאלה רוצה" }]);
await count("student help · first message · 2 chapters", sys, ctx(long), [{ role: "user", content: "לא הבנתי מה השאלה רוצה" }]);
await count("student help · first message · 41 verses", sys, ctx(longest), [{ role: "user", content: "לא הבנתי מה השאלה רוצה" }]);
await count(
  "student help · 4th turn · 41 verses",
  sys,
  ctx(longest),
  [
    { role: "user", content: "לא הבנתי מה השאלה רוצה" },
    { role: "assistant", content: "נועה, בואי נתחיל מהפסוק הראשון: מה דוד מצווה על יואב בפסוק ה׳? קראי שוב את המילים ״לְאַט לִי לַנַּעַר״ — על מי הוא מדבר?" },
    { role: "user", content: "על אבשלום. אבל למה הוא קורא לו נער?" },
    { role: "assistant", content: "שאלה מצוינת! חפשי עכשיו בפרק י״ט פסוק א׳ — באיזו מילה דוד קורא לו שם? מה ההבדל?" },
    { role: "user", content: "שם הוא אומר בני. אז זה משתנה כשהוא מת?" },
  ]
);

// grading proposal: passage + ~8 questions with answers of ~40 words each
const qa = Array.from({ length: 24 }, (_, i) => `שאלה [קריאה והבנה — שדה ${i + 1}]: קראו את הפסוקים וענו מה כתוב, מי אומר למי, ולמה.\nתשובה: ${"דוד אומר ליואב שישמור על אבשלום כי הוא הבן שלו והוא לא רוצה שיקרה לו משהו ".repeat(2)}`).join("\n\n");
await count(
  "grading proposal · 41-verse unit",
  `את/ה עוזר/ת הערכה למורה... הקטע הנלמד: ${longest.mainPassage.ref}: ${passage(longest)}\nהחזר/י JSON בלבד.`,
  `שם התלמיד/ה: נועה כהן\n\nהמשימה: ${longest.content.title}\n\nשאלות ותשובות:\n${qa}`
);
await count(
  "teacher deck/question revision · 41 verses",
  `את/ה עוזר/ת למורה לתנ"ך לערוך את מצגת החזרה...`,
  `היחידה: ${longest.content.title}\n\nהפסוקים:\n${longest.mainPassage.verses.map((v) => `(${v.num}) ${v.text}`).join("\n")}\n\nהמצגת הנוכחית:\n${(longest.content.review?.points ?? []).join("\n")}\n\nההוראה של המורה: קצר יותר`
);
