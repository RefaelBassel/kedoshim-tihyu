import type { TaskContent } from "./types";
import { verses } from "./vayikra-16-verses";

// משימה 3 · ויקרא ט״ז, כ׳–כ״ח — ״וְנָשָׂא הַשָּׂעִיר עָלָיו״: הוידוי על השעיר,
// השילוח למדבר, החלפת הבגדים וסיום העבודה מחוץ למחנה.
const MAIN = verses(20, 28);

export const vayikra16c: TaskContent = {
  ref: "vayikra-16-3",
  mode: "simple",
  title: "״וְנָשָׂא הַשָּׂעִיר עָלָיו״ — השעיר המשתלח וסיום העבודה",
  unit: "ויקרא ט״ז",
  order: 3,
  subtitle: "עבודת הכהן הגדול ביום הכיפורים",
  bookRef: "ספר ויקרא, פרק ט״ז (פסוקים כ׳–כ״ח)",
  skill: "הבנת הנקרא · התמצאות בתנ״ך · טעמי המקרא (אתנחתא וסוף פסוק) · קריאה והאזנה",
  heroArt: {
    art: "wilderness-goat",
    caption:
      "״בְּיַד אִישׁ עִתִּי הַמִּדְבָּרָה״ — השעיר יוצא מהמחנה אל ארץ גזרה, ונושא עליו את מה שהתוודו עליו.",
  },
  partB: {
    title: "שאלות על הפסוקים",
    subtitle: "הבנה, התמצאות בתנ״ך, טעמי המקרא והאזנה — הכול מתוך הפסוקים עצמם.",
    skill: "הבנת הנקרא · התמצאות · טעמים",
  },
  sections: [
    {
      key: "orientation",
      title: "התמצאות בתנ״ך — מציאת פסוקים",
      minutes: 7,
      blocks: [
        {
          type: "question",
          key: "q-find",
          icon: "orientation",
          label: "התמצאות בתנ״ך · חיפוש מהיר",
          prompt:
            "פתחו את פרק ט״ז בתנ״ך הפיזי. מצאו את הפסוק שבו כל אחד מהביטויים הבאים מופיע, וכתבו את מספר הפסוק:",
          fields: [
            { key: "hai", label: "״הַשָּׂעִיר הֶחָי״ — הפעם הראשונה בפרק" },
            { key: "iti", label: "״אִישׁ עִתִּי״" },
            { key: "gzera", label: "״אֶרֶץ גְּזֵרָה״" },
          ],
        },
        {
          type: "question",
          key: "q-azazel-all",
          icon: "orientation",
          label: "התמצאות בתנ״ך · בתוך הפרק",
          prompt:
            "השעיר לעזאזל הוזכר כבר בתחילת הפרק. חפשו את המילה ״לַעֲזָאזֵל״ בכל פרק ט״ז, וכתבו את מספרי כל הפסוקים שבהם היא מופיעה.",
          helper: "עזר: יש יותר משני פסוקים כאלה.",
        },
      ],
    },
    {
      key: "comprehension",
      title: "הבנת הנקרא — מה כתוב?",
      minutes: 12,
      blocks: [
        {
          type: "question",
          key: "q-hands-confess",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק כ״א. (1) מה אהרן עושה בידיים שלו? (2) מה הוא אומר בפה — על מה הוא מתוודה? העתיקו את שלושת הביטויים של הוידוי.",
          fields: [
            { key: "action", label: "(1) הפעולה בידיים" },
            { key: "words", label: "(2) שלושת הביטויים של הוידוי" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״א", verses: verses(21, 21) },
        },
        {
          type: "question",
          key: "q-who-where",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוקים כ״א–כ״ב. (1) מי מוליך את השעיר? (2) לאן הוא מוליך אותו? (3) מה השעיר ״נושא״ עליו?",
          fields: [
            { key: "who", label: "(1) מי מוליך" },
            { key: "where", label: "(2) לאן" },
            { key: "carries", label: "(3) מה השעיר נושא" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים כ״א–כ״ב", verses: verses(21, 22) },
        },
        {
          type: "art",
          key: "art-outside",
          art: "outside-camp",
          caption:
            "מחוץ למחנה: מי שהוליך את השעיר ומי ששרף את הפר והשעיר — שניהם מכבסים ורוחצים לפני שחוזרים.",
        },
        {
          type: "question",
          key: "q-garments-change",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוקים כ״ג–כ״ד. (1) מה אהרן עושה עם בגדי הבד שלבש? (2) מה הוא עושה לפני שהוא לובש את ״בְּגָדָיו״? (3) מה הוא מקריב אחרי שהוא לובש אותם?",
          fields: [
            { key: "linen", label: "(1) בגדי הבד" },
            { key: "wash", label: "(2) לפני הלבישה" },
            { key: "offer", label: "(3) מה מקריבים אחר כך" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים כ״ג–כ״ד", verses: verses(23, 24) },
        },
        {
          type: "question",
          key: "q-two-people",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק כ״ו ואת פסוק כ״ח. שני אנשים חייבים לכבס את בגדיהם ולרחוץ במים לפני שהם חוזרים למחנה. (1) מי האיש בפסוק כ״ו, ומה הוא עשה? (2) מי האיש בפסוק כ״ח, ומה הוא עשה?",
          fields: [
            { key: "first", label: "(1) האיש בפסוק כ״ו" },
            { key: "second", label: "(2) האיש בפסוק כ״ח" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים כ״ו–כ״ח", verses: verses(26, 28) },
        },
        {
          type: "question",
          key: "q-burn",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק כ״ז. מה עושים בפר החטאת ובשעיר החטאת שדמם הובא אל הקודש? (1) לאן מוציאים אותם? (2) מה בדיוק שורפים?",
          fields: [
            { key: "where", label: "(1) לאן מוציאים" },
            { key: "what", label: "(2) מה שורפים" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ז", verses: verses(27, 27) },
        },
      ],
    },
    {
      key: "taamim",
      title: "טעמי המקרא — פסיק ונקודה",
      minutes: 8,
      blocks: [
        {
          type: "question",
          key: "q-etnachta-22",
          icon: "taamim",
          label: "טעמי המקרא",
          prompt:
            "קראו את פסוק כ״ב. (1) באיזו מילה מסומנת האתנחתא? (2) איזה חלק של הפסוק — החלק שלפני האתנחתא או החלק שאחריה — מספר מה השעיר נושא? ואיזה חלק מספר על שילוח השעיר?",
          fields: [
            { key: "word", label: "(1) מילת האתנחתא" },
            { key: "split", label: "(2) מה בכל חלק" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ב", verses: verses(22, 22) },
        },
        {
          type: "question",
          key: "q-punctuate-26",
          icon: "taamim",
          label: "טעמי המקרא · פיסוק",
          prompt:
            "קראו את פסוק כ״ו. (1) קראו אותו בקול נמוך: עצירה קטנה במילת האתנחתא, עצירה ארוכה בסוף הפסוק. (2) העתיקו את הפסוק בלי ניקוד, עם פסיק (,) במקום האתנחתא ונקודה (.) בסוף.",
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ו", verses: verses(26, 26) },
        },
      ],
    },
    {
      key: "listening",
      title: "קריאה והאזנה",
      minutes: 5,
      blocks: [
        {
          type: "question",
          key: "q-listen-21",
          icon: "listening",
          label: "קריאה והאזנה",
          prompt:
            "האזינו לפסוק כ״א (לחצו על מספר הפסוק 🔊). זהו פסוק ארוך. (1) כמה עצירות ברורות שמעתם? (2) בדקו בטקסט: באיזו מילה מסומנת האתנחתא? האם העצירה הארוכה ביותר של הקריין הייתה במילה הזאת?",
          fields: [
            { key: "count", label: "(1) כמה עצירות שמעתם" },
            { key: "check", label: "(2) מילת האתנחתא, ומה שמעתם שם" },
          ],
        },
      ],
    },
  ],
};

export const vayikra16cMainPassage = {
  type: "passage" as const,
  key: "main",
  ref: "ויקרא, פרק ט״ז, פסוקים כ׳–כ״ח",
  decode: true,
  sefariaRef: "Leviticus.16.20-28",
  verses: MAIN,
};
