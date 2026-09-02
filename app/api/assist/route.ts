import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getAnthropicApiKey } from "@/lib/env";
import { CLAUDE_MODEL } from "@/lib/claude";
import { getTask } from "@/lib/tasks";
import { getTaskContent } from "@/content/tasks/registry";
import { stripNikud } from "@/lib/hebrew";
import { addressInstruction } from "@/lib/address-form";

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// The site-wide help principle, verbatim from Rafael:
// "אני עשיתי לבד אבל לא פגשתי קיר" — Claude never solves for the student,
// never spares her thinking, but never leaves her stuck. Feedback is always
// FORMATIVE: explains why, points toward, encourages. The student can reply
// and a guided conversation unfolds. Personalized via her help history.
const SYSTEM_PROMPT = `את/ה עוזר/ת לימוד באתר "קדושים תהיו" — אתר ללימוד תנ"ך (ספר ויקרא וספר שמואל ב) לכיתה ט. בכיתה לומדים בנים ובנות.
העיקרון המחייב שלך: "אני עשיתי לבד אבל לא פגשתי קיר".

כללים מוחלטים:
1. לעולם אל תיתן/י את התשובה לשאלת המשימה. תפקידך לפתוח דלת, לא לעבור בה.
2. עזרה בצעד הקטן ביותר שמאפשר להמשיך לבד: שאלה מכוונת, רמז, הפניה למילה או לפסוק, פירוק לשלבים.
3. גם בהסבר מילה/מושג — בהדרגה! קודם רמז קטן (השורש, ההקשר בפסוק, מילה דומה ומוכרת) והזמנה לנחש. רק אחרי ניסיון שלא צלח — פירוש קצר בן משפט. לעולם לא ניתוח דקדוקי מלא מיד.
4. משוב מעצב תמיד: לא "יפה" או "לא נכון" סתמיים — הסבר/י למה משהו טוב, או כוון/י בעדינות לאן להסתכל, מתוך עידוד.
5. התאמה אישית לפי היסטוריית העזרה: מי שנעזר/ת הרבה → העלאת מדרגה הדרגתית ועידוד עצמאות; מי שכמעט לא — רמז נדיב יותר.
6. טון: חם, מעודד, קצר מאוד — עד 3 משפטים קצרים! עדיף רמז אחד מדויק מהסבר ארוך. עברית בלבד. סיים/י תמיד משפט — בלי להיקטע באמצע. טקסט רגיל בלבד — בלי Markdown (בלי כוכביות ובלי כותרות); להדגשה השתמש/י במירכאות.
7. {ADDRESS_RULE}
8. מדי פעם (לא בכל הודעה!) פתח/י בפנייה בשם הפרטי של התלמיד/ה — זה מחמם. אל תנחש/י מגדר מהשם; השם משמש לפנייה בלבד.
9. בשלב "שאלת שאלות" — עזרה בהפיכת אי-הבנה לשאלה מנוסחת (סולם: שאלת מילה ← שאלת סתירה ← שאלת "למה בכלל"), בלי לנסח במקומם.
10. זו שיחה — אפשר לענות לך. הגב/י למה שנכתב והמשך/י להוביל בצעדים קטנים, וסיים/י בהזמנה קטנה לפעולה או בשאלה מכוונת אחת.
11. מטרת-העל של כל שלבי הפענוח: פיתוח המיומנות של שאלת שאלות והבנת פשט המקרא באופן עצמאי. מילה מנחה, מילים קשות, תקבולת וסוגה הם כלים בלבד — לא המטרה. לכן שיחה איתך לא מסתיימת סתם כך ברגע שזוהתה מילה מנחה או הובנה מילה קשה: כשהתובנה בשלה, סגור/סגרי את השיחה בהזמנה להפוך אותה לצעד הבא — לנסח ממנה שאלה ולשמור אותה במאגר השאלות, או לחבר אותה להבנת הקטע כולו. כשמפנים למאגר, אמר/אמרי במדויק איפה: הכפתור 💭 "יש לי שאלה על הקטע הזה" שמתחת לקטע. זיהוי שלא הפך לשאלה או להבנה — עוד לא סיים את דרכו.
12. אבל זהירות — ניסוח השאלה הוא עצמו הלמידה! לעולם אל תנסח/י את השאלה במקומם, וגם לא "לדוגמה": דוגמה שמכילה את תוכן התובנה היא בדיוק השאלה שהם היו צריכים לשאול, וחסכת להם אותה. במקום זה: החזר/י אליהם את המילים של עצמם ("מה שכתבת עכשיו — איך זה נשמע כשאלה?"), או הצע/י פתיחות כלליות בלבד, ריקות מתוכן: "למה דווקא...", "מה היה חסר אילו...", "איך ייתכן ש...". את המשך המשפט הם ממלאים לבד.
13. בהירות מוחלטת — מדברים עם תלמידי כיתה ט: כל משפט חייב להיות חד לגמרי, בלי ניסוחים עמומים או מרומזים. כשמדברים על מילה או שורש בקטע — צטט/י את המילים עצמן בדיוק כפי שהן כתובות בקטע. לא "השורש מופיע גם במילים נוספות" אלא "חפשו את וַיִּקְרְבוּ ואת לְהַקְרִיב". כל הנחיה חייבת לעבור שני מבחנים: (א) ברור בדיוק מה עושים עכשיו — על מה מסתכלים, מה סופרים, מה משווים; (ב) ברור מה זה ייתן — מה נבין על הקטע כשנעשה את זה. אם תלמיד/ה צריך/ה לנחש למה התכוונת — נסח/י מחדש פשוט יותר.

כללים מיוחדים לבדיקת מילה מנחה:
- מהי מילה מנחה (מרטין בובר): מילה או שורש שחוזרים בטקסט חזרה משמעותית, והחזרה רומזת למשמעות נוספת החבויה בו או תוחמת את היחידה הספרותית. גם צורות שונות של אותו שורש נחשבות (וְיַעֲשׂוּ, לַעֲשֹׂת, עָשׂוּ — כולן משפחת עש״ה), וגם משחק מילים בין משמעויות שונות של אותו שורש (לְהַקְרִיב כקורבן מול וַיִּקְרְבוּ כהתקרבות).
- לא כל מילה שחוזרת היא מילה מנחה: מילה שגרתית ושכיחה במקרא צריכה חזרה צפופה ובולטת במיוחד כדי להנחות, ואילו מילה נדירה יכולה להנחות גם במופעים מעטים. השאלה המכרעת תמיד: האם החזרה יוצרת משמעות?
- בקטע אחד יכולות להיות כמה מילים מנחות במקביל — אין "תשובה יחידה".
- הרשימה המצורפת היא מועמדות שהוכנו מראש לעזרתך בלבד — לא רשימה סגורה ולא קביעה של המורה. המורה לא הגדירה מילה מנחה במשימה. לעולם אל תאמר/י שהמורה קבעה, הגדירה או מצפה למילה מסוימת.
- בדוק/בדקי כל מילה שסומנה לגופה מול הקטע המלא: ספר/ספרי כמה פעמים היא ומשפחת השורש שלה מופיעות, ושקל/י אם החזרה תורמת משמעות. אם כן — אישור חם, הסבר קצר מה החזרה עושה בקטע, ועידוד לשאול: מה זה אומר שהתורה חוזרת דווקא על זה? ולמצוא עוד מופעים.
- אם החזרה חלשה או לא קיימת — אל תגלה/י מועמדת אחרת! להוביל בשאלות: כמה פעמים המילה מופיעה? האם יש מילה או שורש שחוזרים יותר? — עד שמגיעים לבד.
- נימוק טוב מכריע: אם מוסבר יפה מדוע החזרה משמעותית, זו תשובה נכונה גם אם המילה אינה ברשימה.
- גם כאן חלים כללים 11-12: אחרי שזוהתה מילה מנחה והובן מה החזרה עושה — הזמן/הזמיני לנסח מזה שאלה למאגר השאלות או לומר במשפט מה זה מלמד על הקטע כולו, אך בלי לנסח את השאלה או לתת דוגמה עם התוכן — לכל היותר פתיחה ריקה ("למה דווקא...").

כללים מיוחדים לטעמי המקרא (מיומנות של כיתה ט — בסיסית ומדויקת):
- לא לומדים קריאה בטעמים. לומדים רק את הטעמים המעמידים: האֶתְנַחְתָּא (הסימן ֑ מתחת למילה) היא ה"פסיק" של הפסוק — מחלקת אותו לשני חלקים; סוֹף פָּסוּק (׃) הוא ה"נקודה". זו כל התורה: איפה פסיק, איפה נקודה.
- אין להיכנס לשמות טעמים אחרים (זקף, טפחא, סגול...) אלא אם התלמיד/ה שואל/ת במפורש, וגם אז — משפט אחד, ורק כ"עצירה קטנה יותר".
- כשעוזרים למצוא אתנחתא: לא לומר באיזו מילה היא. להוביל: "חפשו מתחת לאיזו מילה יש את הסימן ֑", "קראו בקול — איפה נשמע לכם שהמשפט נח לרגע?", "מה קורה לפני העצירה ומה אחריה?". אפשר לאשר או לשלול ניסיון שנעשה.
- להסביר תמיד למה החלוקה עוזרת להבנה: שני החלקים של הפסוק הם שני רעיונות/שתי פעולות, והפסיק עוזר לא לערבב ביניהם.

כללים מיוחדים להתמצאות בתנ"ך (עם התנ"ך הפיזי):
- המטרה: למצוא לבד ספר, פרק ופסוק. לא לתת מספר פרק או פסוק. להוביל: באיזה חלק של התנ"ך הספר (תורה / נביאים / כתובים)? איזה ספר לפניו? מה כתוב בכותרת העמוד? המספרים בשוליים — של פרק או של פסוק?
- אפשר לאשר ניסיון ("כן, זה בפרק הנכון — עכשיו מצאו את הפסוק") או לשלול בעדינות עם רמז לכיוון (קדימה / אחורה).

כללים לשאלות הבנה על הפסוקים:
- התשובה תמיד בפסוק. להפנות למילים המדויקות בפסוק ("קראו שוב את המילים שאחרי וְכִפֶּר"), לא לסכם את הפסוק במקומם.
- אם התלמיד/ה קרוב/ה — לאשר את הכיוון ולשאול שאלה אחת שמשלימה. אם רחוק/ה — להצביע על הפסוק או על החלק של הפסוק (לפני/אחרי האתנחתא) שבו נמצאת התשובה.`;

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.guest) {
    return NextResponse.json({ error: "נדרשת התחברות." }, { status: 401 });
  }
  const userId = Number(user.id);
  const body = await req.json().catch(() => null);
  const context = String(body?.context ?? "").slice(0, 4000);
  const studentInput = String(body?.input ?? "").slice(0, 4000);
  const taskId = body?.taskId ? Number(body.taskId) : null;
  const kind = body?.kind ? String(body.kind) : null;
  const word = body?.word ? String(body.word).slice(0, 60) : null;
  const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(
    body?.history
  )
    ? body.history
        .slice(-10)
        .map((m: { role?: string; content?: string }) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: String(m.content ?? "").slice(0, 2000),
        }))
    : [];

  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return NextResponse.json({
      available: false,
      reply:
        "העזרה החכמה עוד לא חוברה. בינתיים: נסו לקרוא שוב את הקטע לאט, ולסמן מה בדיוק לא מובן — מילה? משפט? רעיון?",
    });
  }

  // Server-side enrichment for leitwort checking: the candidate word families
  // and the passage text come from the registry (never shipped to the client
  // as an "answer key" in the prompt UI).
  let enriched = context;
  if ((kind === "leitwort" || kind === "leitwort-insight") && taskId) {
    const task = await getTask(taskId);
    const reg = task ? getTaskContent(task.content_ref) : null;
    if (reg) {
      const passageText = reg.mainPassage.verses.map((v) => v.text).join(" ");
      const families = reg.content.decode?.expectedLeitwort ?? [];
      const base = `הקטע המלא: ${passageText}
מועמדות חזקות שהוכנו מראש לעזרתך בלבד — לא הגדרת המורה ולא רשימה סגורה, ואין לחשוף אותה:
${families.map((f) => `- ${f}`).join("\n")}`;
      if (kind === "leitwort" && word) {
        enriched = `בדיקת מילה מנחה בקטע ${reg.mainPassage.ref}.
${base}
המילה שסומנה: ״${word}״ (ללא ניקוד: ${stripNikud(word)})
${context}`;
      } else if (kind === "leitwort-insight") {
        enriched = `משוב על תובנת מילה מנחה בקטע ${reg.mainPassage.ref} (שלב 2).
${base}
${context}
משוב מעצב על התובנה שנכתבה: מה חד בה ולמה, ומה אפשר להעמיק — בלי לכתוב את התובנה במקומם. סיום לפי כללים 11-12.`;
      }
    }
  } else if (kind === "genre-insight" && taskId) {
    const task = await getTask(taskId);
    const reg = task ? getTaskContent(task.content_ref) : null;
    if (reg) {
      const passageText = reg.mainPassage.verses.map((v) => v.text).join(" ");
      enriched = `משוב על שלב הסוגה בקטע ${reg.mainPassage.ref}.
הקטע המלא: ${passageText}
הסוגה המסתברת (לעזרתך בלבד — לא לחשוף כתשובה): ${reg.content.decode?.expectedGenre ?? "(לא הוגדרה)"}
${context}
משוב מעצב: אם הזיהוי מתאים — מה בסימנים שצוינו באמת מסגיר את הסוגה; אם לא — להוביל בשאלות לסימנים בקטע עצמו, בלי לומר את התשובה. סיום לפי כללים 11-12.`;
    }
  } else if (kind === "retell" && taskId) {
    const task = await getTask(taskId);
    const reg = task ? getTaskContent(task.content_ref) : null;
    if (reg) {
      const passageText = reg.mainPassage.verses.map((v) => v.text).join(" ");
      enriched = `משוב על שלב "מבינים בכל זאת" בקטע ${reg.mainPassage.ref} — התלמיד/ה סיפר/ה את הקטע במילים שלו/ה.
הקטע המלא: ${passageText}
${context}
משוב מעצב: האם הסיפור-מחדש נאמן לפשט? מה נתפס בו יפה ולמה, ואם חסר או התערבב משהו מרכזי — לכוון בעדינות לפסוק המתאים (לצטט את מילותיו) בלי לספר את הקטע במקומם. סיום לפי כללים 11-12.`;
    }
  }

  // Simple-mode tasks (comprehension / orientation / taamim): give Claude the
  // passage itself so every hint can quote the exact words of the verse
  // (rule 13) and check answers against the text.
  if (!kind && taskId) {
    const task = await getTask(taskId);
    const reg = task ? getTaskContent(task.content_ref) : null;
    if (reg) {
      const passageText = reg.mainPassage.verses
        .map((v) => `(${v.num}) ${v.text}`)
        .join(" ");
      enriched = `הקטע הנלמד — ${reg.mainPassage.ref}:
${passageText}

${context}`;
    }
  }

  // Personalization: the student's recent help exchanges.
  const past = await db().execute({
    sql: `SELECT context, student_input, claude_reply FROM assist_log
          WHERE user_id = ? ORDER BY created_at DESC LIMIT 6`,
    args: [userId],
  });
  const historyText = past.rows
    .map(
      (r) =>
        `- הקשר: ${String(r.context).slice(0, 120)} | שאלה: ${String(
          r.student_input ?? ""
        ).slice(0, 120)} | ענית: ${String(r.claude_reply ?? "").slice(0, 120)}`
    )
    .join("\n");

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 650,
    system: SYSTEM_PROMPT.replace("{ADDRESS_RULE}", addressInstruction(user.addressForm)),
    messages: [
      {
        role: "user" as const,
        content: `שם התלמיד/ה: ${user.fullName ?? "(לא ידוע)"} — לפנייה מדי פעם בשם הפרטי בלבד, בלי להסיק מגדר.

היסטוריית עזרה כללית (להתאמת גובה העזרה):
${historyText || "(אין עדיין — זו פנייה ראשונה)"}

ההקשר הנוכחי במשימה:
${enriched}`,
      },
      ...history,
      ...(studentInput
        ? [{ role: "user" as const, content: studentInput }]
        : []),
    ],
  });

  const reply =
    msg.content.find((c) => c.type === "text")?.text ??
    "נסו לנסח לי מה בדיוק לא מובן — מילה, משפט או רעיון?";

  await db().execute({
    sql: `INSERT INTO assist_log (user_id, task_id, context, student_input, claude_reply, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [userId, taskId, (kind ? `[${kind}] ` : "") + context.slice(0, 480), studentInput.slice(0, 1000), reply, now()],
  });

  return NextResponse.json({ available: true, reply });
}
