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
  skill: "הבנת הנקרא · התמצאות בתנ״ך · טעמי המקרא (אתנחתא וסוף פסוק) · קריאה והאזנה",
  heroArt: {
    art: "veil-threshold",
    caption:
      "הפרוכת — הגבול שאסור לעבור ״בכל עת״. פעם אחת בשנה, ורק בדרך שהתורה קובעת, נכנס אהרן פנימה.",
  },
  partB: {
    title: "שאלות על הפסוקים",
    subtitle: "הבנה, התמצאות בתנ״ך, טעמי המקרא והאזנה — הכול מתוך הפסוקים עצמם.",
    skill: "הבנת הנקרא · התמצאות · טעמים",
  },
  sections: [
    {
      key: "orientation",
      title: "התמצאות בתנ״ך — פותחים את הספר",
      minutes: 7,
      blocks: [
        {
          type: "question",
          key: "q-neighbors",
          icon: "orientation",
          label: "התמצאות בתנ״ך",
          prompt:
            "פתחו תנ״ך. ספר ויקרא הוא הספר השלישי בחמשת חומשי התורה. איזה ספר נמצא לפניו, ואיזה ספר אחריו?",
          fields: [
            { key: "before", label: "הספר שלפני ויקרא" },
            { key: "after", label: "הספר שאחרי ויקרא" },
          ],
        },
        {
          type: "question",
          key: "q-nadav",
          icon: "orientation",
          label: "התמצאות בתנ״ך · דפדוף אחורה",
          prompt:
            "פסוק א׳ פותח ב״אַחֲרֵי מוֹת שְׁנֵי בְּנֵי אַהֲרֹן״. דפדפו אחורה בספר ויקרא ומצאו את הפרק שבו מסופר על מותם (רמז: חפשו את השמות נָדָב וַאֲבִיהוּא). כתבו את מספר הפרק ואת מספר הפסוק שבו הם מתים.",
          helper: "עזר: זה קרה כמה פרקים לפני פרק ט״ז, ביום חנוכת המשכן.",
          fields: [
            { key: "chapter", label: "פרק" },
            { key: "verse", label: "פסוק" },
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
          key: "q-prohibition",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוק ב׳: מה אסור לאהרן לעשות, ומהי הסיבה שהפסוק נותן לאיסור?",
          fields: [
            { key: "what", label: "האיסור" },
            { key: "why", label: "הסיבה (״כִּי...״)" },
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
            "פסוק ד׳: מנו את ארבעת פריטי הלבוש שאהרן לובש. ממה כולם עשויים? ומה הוא חייב לעשות לפני שהוא לובש אותם?",
          fields: [
            { key: "items", label: "ארבעת הפריטים" },
            { key: "material", label: "ממה הם עשויים" },
            { key: "before", label: "מה עושים לפני הלבישה" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק ד׳", verses: verses(4, 4) },
        },
        {
          type: "question",
          key: "q-animals",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוקים ג׳ ו־ה׳: אילו בעלי חיים מביא אהרן בעצמו, ואילו בעלי חיים לוקחים ״מֵאֵת עֲדַת בְּנֵי יִשְׂרָאֵל״?",
          fields: [
            { key: "aharon", label: "מביא אהרן (פסוק ג׳)" },
            { key: "people", label: "מאת בני ישראל (פסוק ה׳)" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים ג׳–ה׳", verses: verses(3, 5) },
        },
        {
          type: "question",
          key: "q-goats",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "פסוקים ז׳–י׳: שני השעירים עומדים ״פֶּתַח אֹהֶל מוֹעֵד״. מה קובע מה יקרה לכל אחד מהם? ומה נעשה בכל שעיר?",
          fields: [
            { key: "how", label: "מה קובע את הגורל של כל שעיר" },
            { key: "lord", label: "השעיר שעלה עליו הגורל לה׳" },
            { key: "azazel", label: "השעיר שעלה עליו הגורל לעזאזל" },
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
          body: "שני טעמים חשובים לנו השנה: האֶתְנַחְתָּא ( ֑ , סימן קטן מתחת למילה) היא ה״פסיק״ של הפסוק — היא מחלקת אותו לשני חלקים. סוֹף פָּסוּק ( ׃ ) הוא ה״נקודה״. בבלוק ״📖 הפסוקים לעיון״ שבראש המשימה אפשר ללחוץ על ״🎯 אתנחתא״ כדי להדגיש את המילים שבהן היא מסומנת, ועל מספר פסוק כדי לשמוע אותו.",
        },
        {
          type: "question",
          key: "q-etnachta-3",
          icon: "taamim",
          label: "טעמי המקרא",
          prompt:
            "פסוק ג׳: באיזו מילה מסומנת האתנחתא? העתיקו את הפסוק בשני חלקים — מה כתוב לפני האתנחתא ומה אחריה.",
          fields: [
            { key: "word", label: "מילת האתנחתא" },
            { key: "part1", label: "החלק הראשון (עד האתנחתא)" },
            { key: "part2", label: "החלק השני (עד סוף הפסוק)" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוק ג׳", verses: verses(3, 3) },
        },
        {
          type: "question",
          key: "q-etnachta-8",
          icon: "taamim",
          label: "טעמי המקרא",
          prompt:
            "פסוק ח׳: מצאו את מילת האתנחתא. איך חלוקת הפסוק לשניים עוזרת להבין מה נעשה קודם ומה נעשה אחר כך?",
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
            "האזינו לפסוק ב׳ (לחצו על מספר הפסוק 🔊). הקריין עוצר עצירה ברורה באמצע הפסוק. באיזו מילה הוא עוצר? בדקו בטקסט: האם זו המילה שבה מסומנת האתנחתא?",
          fields: [
            { key: "word", label: "המילה שבה הקריין עוצר" },
            { key: "match", label: "האם זו מילת האתנחתא? (כן/לא — ואיך בדקתם)" },
          ],
        },
        {
          type: "question",
          key: "q-read-aloud",
          icon: "listening",
          label: "קריאה בקול",
          prompt:
            "קראו בקול (בשקט, לעצמכם) את פסוקים ז׳–ח׳ עם עצירה קטנה באתנחתא ועצירה ארוכה בסוף כל פסוק. איזו מילה הייתה הכי קשה לקרוא? כתבו אותה, ואם אתם יודעים — מה פירושה.",
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
