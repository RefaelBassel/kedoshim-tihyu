import type { TaskContent } from "./types";
import { verses } from "./vayikra-16-verses";

// משימה 4 · ויקרא ט״ז, כ״ט–ל״ד — ״שַׁבַּת שַׁבָּתוֹן״: חוקת עולם — מהעבודה של
// אהרן לבדו אל הציווי לכל העם, ומהמשכן אל יום הכיפורים של לוח השנה.
const MAIN = verses(29, 34);

export const vayikra16d: TaskContent = {
  ref: "vayikra-16-4",
  mode: "simple",
  title: "״שַׁבַּת שַׁבָּתוֹן״ — חוקת עולם",
  unit: "ויקרא ט״ז",
  order: 4,
  subtitle: "עבודת הכהן הגדול ביום הכיפורים",
  bookRef: "ספר ויקרא, פרק ט״ז (פסוקים כ״ט–ל״ד)",
  skill: "הבנת הנקרא · התמצאות בתנ״ך · טעמי המקרא (אתנחתא וסוף פסוק) · קריאה והאזנה",
  heroArt: {
    art: "tishrei-moon",
    caption:
      "״בַּחֹדֶשׁ הַשְּׁבִיעִי בֶּעָשׂוֹר לַחֹדֶשׁ״ — היום שבלוח השנה שלנו קוראים לו יום הכיפורים.",
  },
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
            "קראו את פסוק כ״ט. הפסוק נותן תאריך: ״בַּחֹדֶשׁ הַשְּׁבִיעִי בֶּעָשׂוֹר לַחֹדֶשׁ״. בתורה סופרים את החודשים מניסן. (1) איזה חודש הוא החודש השביעי? (2) איך קוראים בלוח השנה שלנו ליום העשירי בחודש הזה?",
          fields: [
            { key: "month", label: "(1) החודש השביעי" },
            { key: "day", label: "(2) היום בלוח שלנו" },
          ],
        },
        {
          type: "question",
          key: "q-lev23",
          icon: "orientation",
          label: "התמצאות בתנ״ך · דפדוף קדימה",
          prompt:
            "היום הזה מופיע שוב בספר ויקרא, בפרק כ״ג (פרק המועדים). דפדפו לפרק כ״ג ומצאו את הפסוקים שמדברים על ״הֶעָשׂוֹר לַחֹדֶשׁ הַשְּׁבִיעִי״. (1) מאיזה פסוק עד איזה פסוק? (2) כתבו ביטוי אחד שמופיע גם בפרק כ״ג וגם בפרק ט״ז.",
          fields: [
            { key: "range", label: "(1) טווח הפסוקים בפרק כ״ג" },
            { key: "shared", label: "(2) ביטוי שחוזר בשני הפרקים" },
          ],
          helper: "עזר: חפשו בפרק כ״ג את המילים ״יוֹם הַכִּפֻּרִים״.",
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
            "קראו את פסוק כ״ט. (1) אילו שתי מצוות מצווים בני ישראל ביום הזה? (2) הפסוק מונה שתי קבוצות של אנשים שחייבים במצוות האלה. מי הן שתי הקבוצות?",
          fields: [
            { key: "commands", label: "(1) שתי המצוות" },
            { key: "who", label: "(2) שתי הקבוצות" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ט", verses: verses(29, 29) },
        },
        {
          type: "question",
          key: "q-purpose",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק ל׳. מהי מטרת היום הזה לפי הפסוק? העתיקו את המילים המדויקות מהפסוק.",
          helpVerses: { ref: "פרק ט״ז, פסוק ל׳", verses: verses(30, 30) },
        },
        {
          type: "question",
          key: "q-name",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק ל״א. (1) איך התורה קוראת ליום הזה? (2) איזו מצווה מפסוק כ״ט חוזרת גם בפסוק ל״א?",
          fields: [
            { key: "name", label: "(1) שם היום" },
            { key: "repeat", label: "(2) המצווה שחוזרת" },
          ],
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
            "קראו את פסוק ל״ב. (1) מי יעשה את העבודה הזאת בדורות הבאים, אחרי אהרן? הפסוק מתאר אותו בשני תיאורים — כתבו את שניהם. (2) מה הוא לובש?",
          fields: [
            { key: "who", label: "(1) מי — שני התיאורים" },
            { key: "wears", label: "(2) מה הוא לובש" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק ל״ב", verses: verses(32, 32) },
        },
        {
          type: "question",
          key: "q-list-33",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק ל״ג. הפסוק מונה את כל המקומות והאנשים שמכפרים עליהם ביום הזה. רשמו את כולם, לפי הסדר שבפסוק.",
          helpVerses: { ref: "פרק ט״ז, פסוק ל״ג", verses: verses(33, 33) },
        },
        {
          type: "question",
          key: "q-once-a-year",
          icon: "thinking",
          label: "חשיבה על הפשט",
          prompt:
            "קראו את פסוק ל״ד. (1) כמה פעמים בשנה נעשית הכפרה הזאת? (2) הפסוק נגמר במילים ״וַיַּעַשׂ כַּאֲשֶׁר צִוָּה ה׳ אֶת מֹשֶׁה״. מי לדעתכם ״עשה״ — משה או אהרן? נמקו מתוך הפסוק.",
          fields: [
            { key: "times", label: "(1) כמה פעמים בשנה" },
            { key: "who", label: "(2) מי ״עשה״ — ונימוק" },
          ],
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
            "קראו את פסוק כ״ט. האתנחתא מסומנת במילה ״עוֹלָם״. (1) מה כתוב לפני האתנחתא? (2) מה כתוב אחרי האתנחתא? (3) למה לדעתכם הפסוק מחולק דווקא במקום הזה?",
          fields: [
            { key: "before", label: "(1) לפני האתנחתא" },
            { key: "after", label: "(2) אחרי האתנחתא" },
            { key: "why", label: "(3) למה דווקא כאן" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק כ״ט", verses: verses(29, 29) },
        },
        {
          type: "question",
          key: "q-punctuate-31",
          icon: "taamim",
          label: "טעמי המקרא · פיסוק",
          prompt:
            "קראו את פסוק ל״א. זהו פסוק קצר. העתיקו אותו בלי ניקוד: פסיק (,) במקום האתנחתא, ונקודה (.) בסוף.",
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
            "האזינו לפסוקים כ״ט–ל״א (לחצו על מספר הפסוק 🔊). אחר כך קראו אותם בעצמכם בקול נמוך: עצירה קטנה במילת האתנחתא, עצירה ארוכה בסוף כל פסוק. (1) איזו מילה הייתה הכי קשה לכם לקרוא? (2) מה עזר לכם לקרוא אותה — הניקוד, הקריין, או משהו אחר?",
          fields: [
            { key: "hard", label: "(1) המילה הקשה" },
            { key: "helped", label: "(2) מה עזר" },
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
