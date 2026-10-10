import type { OpeningDeck } from "./types";

// פתיחה ל״סֵדֶר הָעֲבוֹדָה״ (ויקרא ט״ז, משימה 5) — Reut's five slides. The map
// carries the part names of q-parts WITHOUT verse numbers: finding where each
// part starts and ends is the students' work on the worksheet.
export const vayikra16eOpening: OpeningDeck = {
  ref: "vayikra-16-5",
  slides: [
    {
      kind: "reveal",
      lines: ["יום אחד בשנה.", "איש אחד.", "מקום אחד שאסור להיכנס אליו."],
      finale: { quote: "״אַחַ֖ת בַּשָּׁנָ֑ה״", source: "ויקרא ט״ז, ל״ד" },
    },
    {
      kind: "question",
      eyebrow: "✋ שאלה לכיתה",
      facts: [
        { big: "28", text: "פסוקים — מה שאהרן עושה לבדו" },
        { big: "6", text: "פסוקים — מה שכל העם עושה" },
      ],
      ask: "למה לדעתכם?",
      note: "הצביעו. נחזור לשאלה הזו בדיון בסוף היחידה.",
    },
    {
      kind: "challenge",
      eyebrow: "⚡ מי מוצא ראשון?",
      instruction: "פתחו תנ״ך פיזי, ויקרא ט״ז. איפה כתוב",
      quote: "״וְכׇל־אָדָ֞ם לֹא־יִהְיֶ֣ה בְּאֹ֣הֶל מוֹעֵ֗ד״",
      seconds: 60,
      answer: "פסוק י״ז",
    },
    {
      kind: "map",
      eyebrow: "🗺️ מפת הפרק",
      heading: "היום אתם תמצאו איפה כל חלק מתחיל ונגמר.",
      from: "פסוק א׳",
      to: "פסוק ל״ד",
      parts: [
        "ההכנות והכניסה לקודש",
        "שני השעירים והגורלות",
        "עבודת הפנים",
        "השעיר המשתלח וסיום העבודה",
        "חוקת עולם",
      ],
    },
    {
      kind: "launch",
      title: "יוצאים לדרך — פתחו את המשימה",
      sub: "תנ״ך פיזי פתוח, דף העבודה מוכן.",
    },
  ],
};
