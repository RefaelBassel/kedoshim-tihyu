import type { TaskContent } from "./types";
import { verses } from "./vayikra-16-verses";

// משימה 1 · ויקרא ט״ז, א׳–י׳ — ״וְאַל יָבֹא בְכָל עֵת״: הכניסה לקודש, ההכנות
// ושני השעירים. Simple mode: guided first reading + comprehension,
// orientation, taamim (אתנחתא / סוף פסוק) and listening questions. The
// decoding skills (מילה מנחה, מילים קשות, שאלת שאלות) are NOT practised yet.
const MAIN = verses(1, 10);

export const vayikra16a: TaskContent = {
  ref: "vayikra-16-1",
  mode: "simple",
  title: "״וְאַל יָבֹא בְכָל עֵת״ — הכניסה לקודש ושני השעירים",
  unit: "ויקרא ט״ז",
  order: 1,
  subtitle: "עבודת הכהן הגדול ביום הכיפורים",
  bookRef: "ספר ויקרא, פרק ט״ז (פסוקים א׳–י׳)",
  skill: "הבנת הנקרא · טעמי המקרא (אתנחתא וסוף פסוק) · קריאה והאזנה",
  heroArt: {
    art: "veil-threshold",
    caption:
      "הפרוכת — הגבול שאסור לעבור ״בכל עת״. פעם אחת בשנה, ורק בדרך שהתורה קובעת, נכנס אהרן פנימה.",
  },
  partB: {
    title: "שאלות על הפסוקים",
    subtitle: "הבנה, טעמי המקרא והאזנה — הכול מתוך הפסוקים עצמם.",
    skill: "הבנת הנקרא · טעמים",
  },
  sections: [
    {
      key: "comprehension",
      title: "הבנת הנקרא — מה כתוב?",
      minutes: 12,
      blocks: [
        {
          type: "question",
          key: "q-prohibition",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק ב׳. (1) מה אסור לאהרן לעשות? (2) מהי הסיבה שהפסוק נותן לאיסור הזה?",
          fields: [
            { key: "what", label: "(1) מה אסור לאהרן לעשות" },
            { key: "why", label: "(2) הסיבה — מתחילה במילה ״כִּי״" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק ב׳", verses: verses(2, 2) },
        },
        {
          type: "art",
          key: "art-linen",
          art: "linen-garments",
          caption:
            "ארבעה בגדי בד לבנים — לא בגדי הזהב הרגילים של הכהן הגדול. ביום הזה הוא נכנס פנימה בפשטות.",
        },
        {
          type: "question",
          key: "q-garments",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק ד׳. (1) מנו את ארבעת פריטי הלבוש שאהרן לובש. (2) ממה עשויים כל ארבעת הפריטים? (3) מה אהרן חייב לעשות לפני שהוא לובש אותם?",
          fields: [
            { key: "items", label: "(1) ארבעת הפריטים" },
            { key: "material", label: "(2) ממה הם עשויים" },
            { key: "before", label: "(3) מה עושים לפני הלבישה" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק ד׳", verses: verses(4, 4) },
        },
        {
          type: "question",
          key: "q-animals",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוק ג׳ ואת פסוק ה׳. (1) בפסוק ג׳: אילו שני בעלי חיים מביא אהרן בעצמו? (2) בפסוק ה׳: אילו בעלי חיים לוקחים מבני ישראל (״מֵאֵת עֲדַת בְּנֵי יִשְׂרָאֵל״)?",
          fields: [
            { key: "aharon", label: "(1) פסוק ג׳ — מביא אהרן" },
            { key: "people", label: "(2) פסוק ה׳ — לוקחים מבני ישראל" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים ג׳–ה׳", verses: verses(3, 5) },
        },
        {
          type: "question",
          key: "q-goats",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "קראו את פסוקים ז׳–י׳. שני השעירים עומדים בפתח אוהל מועד. (1) איך קובעים מה יקרה לכל אחד משני השעירים? (2) מה עושים בשעיר שעלה עליו הגורל לה׳? (3) מה עושים בשעיר שעלה עליו הגורל לעזאזל?",
          fields: [
            { key: "how", label: "(1) איך קובעים" },
            { key: "lord", label: "(2) השעיר לה׳" },
            { key: "azazel", label: "(3) השעיר לעזאזל" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים ז׳–י׳", verses: verses(7, 10) },
        },
      ],
    },
    {
      key: "taamim",
      title: "טעמי המקרא — איפה עוצרים?",
      minutes: 8,
      blocks: [
        {
          type: "intro",
          key: "intro-taamim",
          body: "שני טעמים חשובים לנו השנה: האֶתְנַחְתָּא ( ֑ , סימן קטן מתחת למילה) היא ה״פסיק״ של הפסוק — היא מחלקת אותו לשני חלקים. סוֹף פָּסוּק ( ׃ ) הוא ה״נקודה״. בבלוק ״📖 הפסוקים לעיון״ שבראש המשימה: לחצו על הכפתור ״🎯 אתנחתא״ כדי להדגיש את המילים שבהן היא מסומנת, ולחצו על מספר של פסוק כדי לשמוע אותו.",
        },
        {
          type: "question",
          key: "q-etnachta-3",
          icon: "taamim",
          label: "טעמי המקרא",
          prompt:
            "קראו את פסוק ג׳. (1) באיזו מילה מסומנת האתנחתא? (2) העתיקו את החלק הראשון של הפסוק: מתחילת הפסוק עד מילת האתנחתא, כולל אותה. (3) העתיקו את החלק השני של הפסוק: מהמילה שאחרי האתנחתא עד סוף הפסוק.",
          fields: [
            { key: "word", label: "(1) מילת האתנחתא" },
            { key: "part1", label: "(2) החלק הראשון" },
            { key: "part2", label: "(3) החלק השני" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק ג׳", verses: verses(3, 3) },
        },
        {
          type: "question",
          key: "q-etnachta-8",
          icon: "taamim",
          label: "טעמי המקרא",
          prompt:
            "קראו את פסוק ח׳. (1) באיזו מילה מסומנת האתנחתא? (2) מה נעשה בחלק הראשון של הפסוק, לפני האתנחתא? (3) מה מפורט בחלק השני של הפסוק, אחרי האתנחתא?",
          fields: [
            { key: "word", label: "(1) מילת האתנחתא" },
            { key: "part1", label: "(2) לפני האתנחתא" },
            { key: "part2", label: "(3) אחרי האתנחתא" },
          ],
          helper: "עזר: החלק הראשון מתאר פעולה אחת; החלק השני מפרט את התוצאה שלה.",
          helpVerses: { ref: "פרק ט״ז, פסוק ח׳", verses: verses(8, 8) },
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
          key: "q-listen-2",
          icon: "listening",
          label: "קריאה והאזנה",
          prompt:
            "האזינו לפסוק ב׳: לחצו על מספר הפסוק 🔊 בבלוק הפסוקים שבראש המשימה. (1) באיזו מילה הקריין עוצר עצירה ברורה באמצע הפסוק? (2) האם זו אותה מילה שבה מסומנת האתנחתא? כתבו כן או לא, וכתבו איך בדקתם.",
          fields: [
            { key: "word", label: "(1) המילה שבה הקריין עוצר" },
            { key: "match", label: "(2) כן / לא — ואיך בדקתם" },
          ],
        },
        {
          type: "question",
          key: "q-read-aloud",
          icon: "listening",
          label: "קריאה בקול",
          prompt:
            "קראו בקול נמוך את פסוקים ז׳–ח׳: עצירה קטנה במילת האתנחתא, ועצירה ארוכה בסוף כל פסוק. איזו מילה הייתה הכי קשה לכם לקרוא? כתבו את המילה. אם אתם יודעים מה פירושה — כתבו גם את הפירוש.",
        },
      ],
    },
  ],
};

export const vayikra16aMainPassage = {
  type: "passage" as const,
  key: "main",
  ref: "ויקרא, פרק ט״ז, פסוקים א׳–י׳",
  decode: true,
  sefariaRef: "Leviticus.16.1-10",
  verses: MAIN,
};
