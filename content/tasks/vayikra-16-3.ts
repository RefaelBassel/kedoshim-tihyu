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
            "מצאו בפרק ט״ז (בתנ״ך הפיזי) את הפסוק שבו כל ביטוי מופיע, וכתבו את מספר הפסוק:",
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
            "השעיר לעזאזל הוזכר כבר בתחילת הפרק. חפשו את המילה ״לַעֲזָאזֵל״ בכל הפרק, וכתבו את כל מספרי הפסוקים שבהם היא מופיעה.",
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
            "פסוק כ״א: אהרן עושה פעולה בידיים ואומר דברים בפה. מה הפעולה, ומה הוא אומר (על מה הוא מתוודה)? העתיקו את שלושת הביטויים של הוידוי.",
          fields: [
            { key: "action", label: "הפעולה בידיים" },
            { key: "words", label: "שלושת הביטויים שמתוודים עליהם" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״א", verses: verses(21, 21) },
        },
        {
          type: "question",
          key: "q-who-where",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוקים כ״א–כ״ב: מי מוליך את השעיר, לאן הוא מוליך אותו, ומה השעיר ״נושא״ עליו?",
          fields: [
            { key: "who", label: "מי מוליך" },
            { key: "where", label: "לאן" },
            { key: "carries", label: "מה השעיר נושא" },
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
            "פסוקים כ״ג–כ״ד: מה אהרן עושה עם בגדי הבד שלבש, מה הוא עושה לפני שהוא לובש את ״בְּגָדָיו״, ומה הוא מקריב אחר כך?",
          fields: [
            { key: "linen", label: "בגדי הבד" },
            { key: "wash", label: "לפני הלבישה" },
            { key: "offer", label: "מה מקריבים אחר כך" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים כ״ג–כ״ד", verses: verses(23, 24) },
        },
        {
          type: "question",
          key: "q-two-people",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוקים כ״ו וכ״ח: שני אנשים חייבים לכבס את בגדיהם ולרחוץ במים לפני שהם חוזרים למחנה. מי הם, ומה עשה כל אחד מהם?",
          fields: [
            { key: "first", label: "האיש בפסוק כ״ו" },
            { key: "second", label: "האיש בפסוק כ״ח" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים כ״ו–כ״ח", verses: verses(26, 28) },
        },
        {
          type: "question",
          key: "q-burn",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוק כ״ז: מה נעשה בפר החטאת ובשעיר החטאת ״אֲשֶׁר הוּבָא אֶת דָּמָם לְכַפֵּר בַּקֹּדֶשׁ״? איפה זה נעשה, ומה בדיוק שורפים?",
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
            "פסוק כ״ב: מצאו את האתנחתא. איזה חלק של הפסוק מספר מה השעיר נושא, ואיזה חלק מספר על שילוחו?",
          fields: [
            { key: "word", label: "מילת האתנחתא" },
            { key: "split", label: "מה בכל חלק" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ב", verses: verses(22, 22) },
        },
        {
          type: "question",
          key: "q-punctuate-26",
          icon: "taamim",
          label: "טעמי המקרא · פיסוק",
          prompt:
            "פסוק כ״ו: קראו בקול עם עצירה קטנה באתנחתא ועצירה ארוכה בסוף. אחר כך העתיקו את הפסוק בלי ניקוד עם פסיק ונקודה במקומות הנכונים.",
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
            "האזינו לפסוק כ״א (🔊) — פסוק ארוך. ספרו כמה עצירות ברורות שמעתם. אחר כך בדקו בטקסט: איפה האתנחתא ואיפה סוף הפסוק? האם העצירה הכי ארוכה של הקריין הייתה באתנחתא?",
          fields: [
            { key: "count", label: "כמה עצירות שמעתם" },
            { key: "check", label: "איפה האתנחתא, ומה שמעתם שם" },
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
