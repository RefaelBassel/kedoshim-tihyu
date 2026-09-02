@AGENTS.md

# Claude Code instructions — kedoshim-tihyu (קדושים תהיו)

## What this is
Learning site for 9th-grade students (boys and girls) studying **תנ״ך** at
תיכון שחרית. Sister site of בינת התורה (`C:\Users\User\Documents\tanach`, 10th
grade) and בינת התלמוד (`C:\Users\User\Documents\gemara10`) — same
architecture, separate accounts (new Turso DB, new Vercel project, new Google
OAuth client).

Site name: קדושים תהיו.
Subtitle: איך נראית חברה מתוקנת על פי ספרים ויקרא ושמואל ב.
Second subtitle: תוכנית בתנ"ך לכיתות ט, תיכון שחרית.

## Working rules (from Rafael)
1. **Plan before code.** New phase → written plan → wait for approval → implement.
2. **Hebrew UI, English code.** Students and teachers see 100% Hebrew RTL. Identifiers,
   comments, commit messages: English.
3. **No speculative content.** Which skill enters which topic, the exam drills, and the
   project work space come from the teacher later — do not invent.
4. **Ask before choosing between 2 reasonable options.**

## Stack invariants
- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4
- Auth.js (next-auth v5 beta): Google sign-in + guest (read-only) credentials provider
- Turso (libSQL) via `@libsql/client` — raw SQL, no ORM; local dev uses `file:local.db`
- Migrations: `migrations/00NN_*.sql`, additive only; apply with `node scripts/migrate.mjs`
- Vercel deploy target (new project, not tanach's)

## Language and typography
- `<html lang="he" dir="rtl">`
- Fonts via `next/font`: **Heebo** (body) + **Assistant** (display headings) +
  **David Libre** (`.font-mikra`, the biblical text — it renders טעמי המקרא, Heebo does not)
- Palette 4 "גפן ותאנה": bg `#fbf6f1`, ink `#2e2438`, primary `#413055` (grape),
  accent `#b96a3b` (copper), card `#fffdfa`, border `#e9ddd2`,
  status: success `#3e6b4f` / warning `#b3892b` / danger `#9d3438`
- Hebrew only in visible text — never in `className`, `id`, or `data-*`

## Roles
- Teachers (lib/roles.ts): reutst99@gmail.com (ריעות רוקח), refaelbassel@gmail.com (רפאל)
- Everyone else who signs in with Google = student
- First login → /onboarding: full Hebrew name, class (e.g. ט2), form of address
  (כינוי גוף: נקבה / זכר / ניטרלי — injected into every Claude prompt)

## Pages (top nav order)
דף הבית (/), עמוד אישי (/me), התוכנית ולו"ז (/program), משימות שוטפות (/tasks),
הכנות למבחנים (/exams), הפרויקט (/project), כללי השיעור שלנו (/rules), קשר (/messages),
דשבורד מורה (/dashboard, teacher only)

## Footer (exact text, every page; parts spaced apart, gap-x between segments)
בית מדרש תורה שבכתב תיכון שחרית · פיתוח וכתיבה: ריעות רוקח · ייעוץ והדרכה: נעמה סינגל · פריסת אתר: רפאל באסל · כל הזכויות שמורות

## Curriculum (content/source: the teacher's planning document)
- ויקרא: ט״ז FIRST (יום הכיפורים adjacency), then א–ה+ז (selected verses), ח–י, יא–יד,
  יח, יט, כג+כה, כו. שמואל ב: א–ב, ה–ז, יא–יד, טו–יט, כד. Lesson counts are ignored.
- Six skills: קריאה, טעמי המקרא (אתנחתא = comma, סוף פסוק = period — NOT cantillation
  reading), התמצאות בתנ"ך (physical book), מילה מנחה, שאלת שאלות (from semester 2),
  מילה קשה. The first three are practised physically by the teacher AND asked about
  in the site tasks.
- Project: "מדריך/אפליקציה לחברה מתוקנת" → a public campaign in 4 stages (see /project).

## Task modes (content/tasks/types.ts)
- `mode: "full"` — the 7-stage pshat decode (Part A) + worksheet (Part B), as in בינת התורה.
- `mode: "simple"` — ONE guided first-reading stage (audio, taamim toggles, no word
  marking, no question bank) + worksheet. The five ויקרא ט״ז tasks are simple.
- Verse text with taamim lives in content/tasks/vayikra-16-verses.ts (Sefaria, the Name
  written ה׳ keeping its taam).

## Audio
- public/audio/tanach/Leviticus.16.mp3 — Shmuelof narration via Mechon Mamre
  (CC BY-NC-ND, served unmodified, credit in UI). audio-map.json built by
  scripts/asr_align_verses.py (needs a full ffmpeg — the Playwright one is stripped;
  `python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`).
