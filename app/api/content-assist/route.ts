import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireTeacher } from "@/lib/api-auth";
import { getAnthropicApiKey } from "@/lib/env";
import { CLAUDE_MODEL } from "@/lib/claude";
import { getTaskContent } from "@/content/tasks/registry";
import { effectiveContent } from "@/lib/content-overrides";

// Claude helps the TEACHER revise a unit's review deck and/or its discussion
// question, on her instruction ("קצר יותר", "הוסיפי נקודה על…", "שאלת דיון
// מזווית של…"). It returns a PROPOSAL only — nothing is saved until she
// applies it in the editor (and she can edit the proposal first).
export async function POST(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => ({}));
  const contentRef = String(body?.contentRef ?? "");
  const baseReg = getTaskContent(contentRef);
  if (!baseReg) return NextResponse.json({ error: "תוכן היחידה לא נמצא." }, { status: 404 });
  const content = await effectiveContent(baseReg.content);

  const instruction = String(body?.instruction ?? "").trim().slice(0, 1200);
  const includeQuestion = Boolean(body?.includeQuestion);
  if (!instruction) return NextResponse.json({ error: "כתבי מה לשנות." }, { status: 400 });

  const apiKey = getAnthropicApiKey();
  if (!apiKey) return NextResponse.json({ error: "מפתח Claude לא מוגדר." }, { status: 500 });

  const passage = baseReg.mainPassage.verses.map((v) => `(${v.num}) ${v.text}`).join("\n");
  const current = {
    points: content.review?.points ?? [],
    skill: content.review?.skill ?? "",
    question: content.discussion?.question ?? "",
    teacherNote: content.discussion?.teacherNote ?? "",
  };

  const system = `את/ה עוזר/ת למורה לתנ"ך בכיתה ט (בנים ובנות) לערוך את מצגת החזרה של יחידת לימוד${includeQuestion ? " ואת שאלת הדיון שלה" : ""}.
מצגת החזרה: 3-4 נקודות קצרות (עד 12 מילים כל אחת, בסדר הפסוקים, אפשר לצטט ביטוי מדויק מהפסוקים במירכאות ״…״), ושורת מיומנות אחת. היא תזכורת תמציתית למי שלמד — לא תחליף ללימוד.
${includeQuestion ? "שאלת הדיון: שאלה אחת לדיבייט כיתתי, עם שני צדדים אפשריים, שנשענת על פרט ספציפי בפסוקים כך שמי שלא למד לא יכול באמת לדון בה; קשורה כשזה טבעי לשאלת השנה ״איך בונים חברה צודקת״. יחד איתה — הערה למורה בשורה אחת: על מה בפסוקים כל צד נשען.\n" : ""}
כללים: פשט בלבד, בלי פרשנים ובלי ידע חיצוני; עברית ברורה לכיתה ט; לשמור על מה שהמורה לא ביקשה לשנות; לבצע בדיוק את ההוראה שלה. להחזיר אך ורק דרך הכלי propose_deck.`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 900,
    system,
    tools: [
      {
        name: "propose_deck",
        description: "ההצעה המתוקנת למצגת החזרה (ולשאלת הדיון אם התבקש).",
        input_schema: {
          type: "object",
          properties: {
            points: { type: "array", items: { type: "string" }, description: "3-4 נקודות קצרות בסדר הפסוקים" },
            skill: { type: "string", description: "שורת המיומנות" },
            question: { type: "string", description: "שאלת הדיון המתוקנת (רק אם התבקש)" },
            teacherNote: { type: "string", description: "הערה למורה על שני הצדדים (רק אם התבקש)" },
            note: { type: "string", description: "משפט אחד למורה: מה שונה ולמה" },
          },
          required: ["points", "skill", "note"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_deck" },
    messages: [
      {
        role: "user",
        content: `היחידה: ${content.title} · ${content.bookRef}

הפסוקים:
${passage}

המצגת הנוכחית:
${current.points.map((p, i) => `${i + 1}. ${p}`).join("\n") || "(ריק)"}
מיומנות: ${current.skill || "(ריק)"}
${includeQuestion ? `\nשאלת הדיון הנוכחית: ${current.question || "(ריק)"}\nהערת המורה הנוכחית: ${current.teacherNote || "(ריק)"}\n` : ""}
ההוראה של המורה: ${instruction}`,
      },
    ],
  });
  const tool = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const input = (tool?.input ?? {}) as Record<string, unknown>;
  const points = Array.isArray(input.points)
    ? input.points.map((p) => String(p).trim()).filter(Boolean).slice(0, 6)
    : [];
  if (points.length === 0) {
    return NextResponse.json({ error: "לא התקבלה הצעה — נסי לנסח את ההוראה אחרת." }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    proposal: {
      points,
      skill: String(input.skill ?? current.skill).trim(),
      question: includeQuestion ? String(input.question ?? "").trim() || null : null,
      teacherNote: includeQuestion ? String(input.teacherNote ?? "").trim() || null : null,
      note: String(input.note ?? "").trim(),
    },
  });
}
