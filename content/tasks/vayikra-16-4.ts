import type { TaskContent } from "./types";
import { verses } from "./vayikra-16-verses";

// משימה 4 · ויקרא ט״ז, כ״ט–ל״ד — ״שַׁבַּת שַׁבָּתוֹן״: חוקת עולם — מהעבודה של
// אהרן לבדו אל הציווי לכל העם, ומהמשכן אל יום הכיפורים של לוח השנה.
const MAIN = verses(29, 34);

export const vayikra16d: TaskContent = {
  ref: "vayikra-16-4",
  mode: "simple",
  title: "״שַׁבַּת שַׁבָּתוֹן״ — חוקת עולם",
  subtitle: "עבודת הכהן הגדול ביום הכיפורים · חלק 4 מתוך 5",
  bookRef: "ספר ויקרא, פרק ט״ז (פסוקים כ״ט–ל״ד)",
  skill: "הבנת הנקרא · התמצאות בתנ״ך · טעמי המקרא (אתנחתא וסוף פסוק) · קריאה והאזנה",
  readingIntro:
    "עד עכשיו הפרק דיבר על אהרן. מכאן הוא פונה אליכם: ״לָכֶם״, ״תְּעַנּוּ״, ״תִּטְהָרוּ״. קראו את ששת הפסוקים, ואז האזינו 🔊. שימו לב לפסוק ל״א — הוא קצר, ובכל זאת יש בו אתנחתא. איפה?",
  heroArt: {
    art: "tishrei-moon",
    caption:
      "״בַּחֹדֶשׁ הַשְּׁבִיעִי בֶּעָשׂוֹר לַחֹדֶשׁ״ — היום שבלוח השנה שלנו קוראים לו יום הכיפורים.",
  },
  partA: { title: "קריאה ראשונה והאזנה", skill: "קריאה, האזנה והתמצאות בפרק" },
  partB: {
    title: "שאלות על הפסוקים",
    subtitle: "הבנה, התמצאות בתנ״ך, טעמי המקרא והאזנה — הכול מתוך הפסוקים עצמם.",
    skill: "הבנת הנקרא · התמצאות · טעמים",
  },
  sections: [
    {
      key: "orientation",
      title: "התמצאות בתנ״ך — היום בלוח השנה ובפרק אחר",
      minutes: 7,
      blocks: [
        {
          type: "question",
          key: "q-date",
          icon: "orientation",
          label: "התמצאות · לוח השנה",
          prompt:
            "פסוק כ״ט נותן תאריך: ״בַּחֹדֶשׁ הַשְּׁבִיעִי בֶּעָשׂוֹר לַחֹדֶשׁ״. בתורה סופרים את החודשים מניסן. איזה חודש הוא החודש השביעי? ואיזה יום בלוח השנה שלנו הוא ״העשור לחודש״ הזה?",
          fields: [
            { key: "month", label: "החודש השביעי" },
            { key: "day", label: "היום בלוח שלנו" },
          ],
        },
        {
          type: "question",
          key: "q-lev23",
          icon: "orientation",
          label: "התמצאות בתנ״ך · דפדוף קדימה",
          prompt:
            "היום הזה מופיע שוב בספר ויקרא, בפרק כ״ג — פרק המועדים. דפדפו לשם ומצאו את הפסוקים שמדברים על ״הֶעָשׂוֹר לַחֹדֶשׁ הַשְּׁבִיעִי״. מאיזה פסוק עד איזה פסוק? ואיזה ביטוי שם חוזר גם בפרק שלנו?",
          helper: "עזר: חפשו בפרק כ״ג את המילים ״יוֹם הַכִּפֻּרִים״.",
          fields: [
            { key: "range", label: "טווח הפסוקים בפרק כ״ג" },
            { key: "shared", label: "ביטוי שחוזר בשני הפרקים" },
          ],
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
          key: "q-two-commands",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוק כ״ט: אילו שתי מצוות מצווים ביום הזה? ומי חייב בהן — אילו שתי קבוצות מונה הפסוק?",
          fields: [
            { key: "commands", label: "שתי המצוות" },
            { key: "who", label: "שתי הקבוצות" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ט", verses: verses(29, 29) },
        },
        {
          type: "question",
          key: "q-purpose",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוק ל׳: מהי מטרת היום לפי הפסוק? העתיקו את המילים המדויקות (״...לְטַהֵר אֶתְכֶם...״).",
          helpVerses: { ref: "פרק ט״ז, פסוק ל׳", verses: verses(30, 30) },
        },
        {
          type: "question",
          key: "q-name",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוק ל״א: איך התורה מכנה את היום הזה? ומה חוזר בפסוק הזה מפסוק כ״ט?",
          helpVerses: { ref: "פרק ט״ז, פסוקים כ״ט, ל״א", verses: [...verses(29, 29), ...verses(31, 31)] },
        },
        {
          type: "art",
          key: "art-gathered",
          art: "gathered-people",
          caption:
            "מאהרן לבדו — אל ״כָּל עַם הַקָּהָל״. הפרק שהתחיל באדם אחד בקודש נגמר בציווי לכולם.",
        },
        {
          type: "question",
          key: "q-future-priest",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוק ל״ב: מי יעשה את העבודה הזאת בדורות הבאים, אחרי אהרן? איך הפסוק מתאר אותו (שני תיאורים), ומה הוא לובש?",
          fields: [
            { key: "who", label: "מי" },
            { key: "wears", label: "מה הוא לובש" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק ל״ב", verses: verses(32, 32) },
        },
        {
          type: "question",
          key: "q-list-33",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוק ל״ג מונה את כל מה שמכפרים עליו ביום הזה — מקומות ואנשים. רשמו את כולם לפי הסדר בפסוק.",
          helpVerses: { ref: "פרק ט״ז, פסוק ל״ג", verses: verses(33, 33) },
        },
        {
          type: "question",
          key: "q-once-a-year",
          icon: "thinking",
          label: "חשיבה על הפשט",
          prompt:
            "פסוק ל״ד: כמה פעמים בשנה נעשית הכפרה הזאת? הפסוק נגמר ב״וַיַּעַשׂ כַּאֲשֶׁר צִוָּה ה׳ אֶת מֹשֶׁה״. מי לדעתכם ״עשה״ — משה או אהרן? נמקו מתוך הפסוק.",
          helpVerses: { ref: "פרק ט״ז, פסוק ל״ד", verses: verses(34, 34) },
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
          key: "q-etnachta-29",
          icon: "taamim",
          label: "טעמי המקרא",
          prompt:
            "פסוק כ״ט: האתנחתא נמצאת במילה ״עוֹלָם״. מה כתוב לפניה ומה אחריה? למה לדעתכם הפסוק מחולק דווקא במקום הזה?",
          fields: [
            { key: "before", label: "לפני האתנחתא" },
            { key: "after", label: "אחרי האתנחתא" },
            { key: "why", label: "למה דווקא כאן" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ט", verses: verses(29, 29) },
        },
        {
          type: "question",
          key: "q-punctuate-31",
          icon: "taamim",
          label: "טעמי המקרא · פיסוק",
          prompt:
            "פסוק ל״א הוא פסוק קצר. העתיקו אותו בלי ניקוד עם פסיק במקום האתנחתא ונקודה בסוף.",
          helpVerses: { ref: "פרק ט״ז, פסוק ל״א", verses: verses(31, 31) },
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
          key: "q-read-29-31",
          icon: "listening",
          label: "קריאה והאזנה",
          prompt:
            "האזינו לפסוקים כ״ט–ל״א (🔊), ואז קראו אותם בעצמכם בקול נמוך, עם עצירה באתנחתא ועצירה ארוכה בסוף כל פסוק. איזו מילה הייתה הכי קשה לקרוא? מה עזר לכם — הניקוד, הקריין, או משהו אחר?",
          fields: [
            { key: "hard", label: "המילה הקשה" },
            { key: "helped", label: "מה עזר" },
          ],
        },
      ],
    },
  ],
};

export const vayikra16dMainPassage = {
  type: "passage" as const,
  key: "main",
  ref: "ויקרא, פרק ט״ז, פסוקים כ״ט–ל״ד",
  decode: true,
  sefariaRef: "Leviticus.16.29-34",
  verses: MAIN,
};
