import type { TaskContent } from "./types";
import { VAYIKRA_16, verses } from "./vayikra-16-verses";

// משימה 5 · ויקרא ט״ז — סיכום: ״סֵדֶר הָעֲבוֹדָה״. The whole chapter as one
// passage: mapping its structure, fast verse-finding, listening to the full
// narration, and telling the day in one's own words.
const MAIN = VAYIKRA_16;

export const vayikra16e: TaskContent = {
  ref: "vayikra-16-5",
  mode: "simple",
  title: "סֵדֶר הָעֲבוֹדָה — מפת הפרק כולו",
  unit: "ויקרא ט״ז",
  order: 5,
  subtitle: "עבודת הכהן הגדול ביום הכיפורים · סיכום",
  bookRef: "ספר ויקרא, פרק ט״ז (הפרק כולו)",
  skill: "התמצאות בתנ״ך · הבנת המבנה · טעמי המקרא · האזנה לפרק שלם",
  heroArt: {
    art: "chapter-map",
    caption:
      "מהפרוכת אל המדבר ובחזרה: פרק ט״ז הוא סדר של פעולות, במקום ובזמן. היום נבנה לו מפה.",
  },
  readingIntro:
    "הפרק כולו — 34 פסוקים. ״🔊 האזנה לקטע״ משמיע אותו מתחילתו ועד סופו; עקבו בתנ״ך הפיזי.",
  partB: {
    title: "מפת הפרק",
    subtitle: "מבנה, התמצאות מהירה, טעמים — וסיכום במילים שלכם.",
    skill: "התמצאות · מבנה · טעמים",
  },
  sections: [
    {
      key: "structure",
      title: "מבנה הפרק — חמישה חלקים",
      minutes: 10,
      blocks: [
        {
          type: "intro",
          key: "intro-structure",
          body: "למדנו את הפרק בארבעה שיעורים, אבל הפרק עצמו מתחלק לחמישה חלקים לפי הפעולות. לכל חלק — כתבו מאיזה פסוק עד איזה פסוק הוא נמשך. דפדפו בתנ״ך הפיזי וחפשו את המילים שבהן כל חלק מתחיל.",
        },
        {
          type: "question",
          key: "q-parts",
          icon: "orientation",
          label: "התמצאות · מבנה הפרק",
          prompt: "טווח הפסוקים של כל חלק:",
          fields: [
            { key: "p1", label: "1 · ההכנות והכניסה לקודש (בגדים, פר, איל)" },
            { key: "p2", label: "2 · שני השעירים והגורלות" },
            { key: "p3", label: "3 · עבודת הפנים: הקטורת, הדם והכפרה על הקודש" },
            { key: "p4", label: "4 · השעיר המשתלח וסיום העבודה מחוץ למחנה" },
            { key: "p5", label: "5 · חוקת עולם — הציווי לכל העם" },
          ],
        },
        {
          type: "question",
          key: "q-garment-changes",
          icon: "reading",
          label: "קריאה והבנה · לאורך הפרק",
          prompt:
            "אהרן מחליף בגדים כמה פעמים בפרק. מצאו את כל הפסוקים שבהם הוא לובש או פושט בגדים, וכתבו לכל פסוק: מה לובשים או פושטים.",
        },
      ],
    },
    {
      key: "fast-find",
      title: "התמצאות מהירה — מי מוצא ראשון?",
      minutes: 7,
      blocks: [
        {
          type: "art",
          key: "art-scroll-finger",
          art: "scroll-finger",
          caption: "אצבע על הפסוק, עין על המספר — זו כל התורה של ההתמצאות.",
        },
        {
          type: "question",
          key: "q-fast",
          icon: "orientation",
          label: "התמצאות · חיפוש מהיר",
          prompt:
            "בתנ״ך הפיזי (המסך סגור!): באיזה פסוק בפרק ט״ז מופיע כל ביטוי? כתבו את מספר הפסוק.",
          fields: [
            { key: "seven", label: "״שֶׁבַע פְּעָמִים״ — הפעם הראשונה" },
            { key: "shabbat", label: "״שַׁבַּת שַׁבָּתוֹן״" },
            { key: "gorel", label: "״גּוֹרָל אֶחָד לַה׳״" },
            { key: "adam", label: "״וְכָל אָדָם לֹא יִהְיֶה בְּאֹהֶל מוֹעֵד״" },
          ],
        },
        {
          type: "question",
          key: "q-pages",
          icon: "orientation",
          label: "התמצאות · בתנ״ך שלכם",
          prompt:
            "בתנ״ך שבידכם: באיזה עמוד מתחיל ספר ויקרא, ובאיזה עמוד מתחיל פרק ט״ז? כמה עמודים יש בין תחילת הספר לפרק שלנו?",
          fields: [
            { key: "book", label: "עמוד תחילת הספר" },
            { key: "chapter", label: "עמוד תחילת פרק ט״ז" },
          ],
        },
      ],
    },
    {
      key: "comprehension",
      title: "הבנת הפרק — שני השעירים ו״לא ימות״",
      minutes: 8,
      blocks: [
        {
          type: "question",
          key: "q-two-goats",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "סכמו בשני משפטים: מה נעשה בשעיר שעלה עליו הגורל לה׳, ומה נעשה בשעיר שעלה עליו הגורל לעזאזל? (היעזרו בפסוקים ט׳–י׳, ט״ו, כ׳–כ״ב.)",
          fields: [
            { key: "lord", label: "השעיר לה׳" },
            { key: "azazel", label: "השעיר לעזאזל" },
          ],
          helpVerses: {
            ref: "פרק ט״ז, פסוקים ט׳–י׳, ט״ו, כ׳–כ״ב",
            verses: [...verses(9, 10), ...verses(15, 15), ...verses(20, 22)],
          },
        },
        {
          type: "question",
          key: "q-not-die",
          icon: "reading",
          label: "קריאה והבנה",
          prompt:
            "הביטוי ״וְלֹא יָמוּת״ מופיע בפרק פעמיים — בפסוק ב׳ ובפסוק י״ג. בכל אחד מהם: מה צריך לעשות (או לא לעשות) כדי לא למות?",
          fields: [
            { key: "v2", label: "פסוק ב׳" },
            { key: "v13", label: "פסוק י״ג" },
          ],
          helpVerses: { ref: "פרק ט״ז, פסוקים ב׳, י״ג", verses: [...verses(2, 2), ...verses(13, 13)] },
        },
      ],
    },
    {
      key: "taamim",
      title: "טעמי המקרא — שלושה פסוקים שבחרתם",
      minutes: 6,
      blocks: [
        {
          type: "question",
          key: "q-three-etnachta",
          icon: "taamim",
          label: "טעמי המקרא",
          prompt:
            "בחרו שלושה פסוקים מהפרק (אחד מכל שליש: א׳–י׳, י״א–כ״ב, כ״ג–ל״ד). לכל פסוק כתבו את מספרו ואת המילה שבה מסומנת האתנחתא. (יש בפרק פסוק אחד קצר בלי אתנחתא בכלל — מי מוצא אותו?)",
          fields: [
            { key: "a", label: "פסוק 1 — מספר ומילת האתנחתא" },
            { key: "b", label: "פסוק 2 — מספר ומילת האתנחתא" },
            { key: "c", label: "פסוק 3 — מספר ומילת האתנחתא" },
          ],
        },
      ],
    },
    {
      key: "wrap",
      title: "האזנה וסיכום",
      minutes: 7,
      blocks: [
        {
          type: "question",
          key: "q-listen-all",
          icon: "listening",
          label: "קריאה והאזנה · הפרק כולו",
          prompt:
            "האזנתם לפרק כולו תוך מעקב בתנ״ך הפיזי. באיזה פסוק (אם בכלל) ״איבדתם״ את הקריין לרגע? מה עזר לכם לחזור אליו?",
          fields: [
            { key: "lost", label: "איפה איבדתי (או: לא איבדתי)" },
            { key: "back", label: "מה עזר לחזור" },
          ],
        },
        {
          type: "question",
          key: "q-explain",
          icon: "thinking",
          label: "במילים שלי",
          prompt:
            "אם הייתם צריכים להסביר לתלמיד או תלמידה בכיתה ח׳, בשלושה משפטים, מה קורה במשכן ביום הזה — מה הייתם אומרים? (בלי פרשנים, רק מה שכתוב בפרק.)",
          minWords: 20,
        },
      ],
    },
  ],
};

export const vayikra16eMainPassage = {
  type: "passage" as const,
  key: "main",
  ref: "ויקרא, פרק ט״ז — הפרק כולו",
  decode: true,
  sefariaRef: "Leviticus.16",
  verses: MAIN,
};
