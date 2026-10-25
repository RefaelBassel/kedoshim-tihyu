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
- `mode: "simple"` — NO Part A (the reading happens in class with a physical Tanach);
  the worksheet only, with the passage as a collapsible reference block on top (audio,
  taamim toggles, no word marking, no question bank). The five ויקרא ט״ז tasks are simple.
- Pinned verses (issue #9): a question's `verses` (and a field's `verses`) is a Hebrew spec
  of the main chapter ("ד׳, כ״ג–כ״ד, ל״ב", lib/verse-spec.ts) shown in an open box beside the
  question (sticky on wide screens); `versesNote` replaces the box with one line. Teacher
  overrides live in the worksheet edits (`verses`, key "q" / "q:field"), editable in
  WorksheetEditor and via edit_unit_texts `verses`.
- Verse text with taamim lives in content/tasks/vayikra-16-verses.ts (Sefaria, the Name
  written ה׳ keeping its taam).

## Audio
- public/audio/tanach/Leviticus.16.mp3 — Shmuelof narration via Mechon Mamre
  (CC BY-NC-ND, served unmodified, credit in UI). audio-map.json built by
  scripts/asr_align_verses.py (needs a full ffmpeg — the Playwright one is stripped;
  `python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`).

## Printable worksheets
- `npm run build:print` (scripts/build-print.mts) renders every task in the registry to
  public/print/<ref>.pdf (Chromium, A4, 2 cm margins, page numbers, no separator rules)
  and public/print/<ref>.docx (editable, RTL), and writes content/tasks/print-manifest.json.
  Re-run after any content change and commit the files; the task pages show the links.


## Access & notifications (27.9.2026)
- Google-only sign-in; every new account is PENDING until a teacher approves it in
  `/dashboard/students` (approve / block / remove / pre-approve by email). Guest sign-in
  was removed. Gate = root `proxy.ts` running the full auth on Node (lib/approval.ts).
- The site NEVER emails teachers (enforced in lib/email.ts); local dev never sends email.
- Cancelling a task unassigns without deleting work (task_cancellations); republish restores.

## The debate layer (Reut's design, 27.9.2026)
Class strength = debate. Each unit carries a `discussion` question (tied to its verses)
and `review` points; a lesson has three tools in ANY order (teacher's choice, never
enforced): 🔁 review deck (`/dashboard/review/[taskId]`), 💬 debate on the PREVIOUS
unit's question (`/dashboard/discussion/[taskId]/control` = teacher's phone/laptop,
`/board` = projector, input-free; state in lib/discussion.ts tables, polled), 📖 study.
Only students who answered every worksheet question are eligible to speak (teacher can
override). Teacher edits everything in place: worksheet questions (hide / reword / add),
discussion, review — lib/content-overrides.ts, `/dashboard/content`. Rule from Rafael:
a projected board never contains teacher input; the control is a separate page.

## Lesson page, editability, Claude assist (28.9.2026)
- `/dashboard/lesson` (nav: "מהלך השיעור") is ONE screen built around THE REELS
  (`components/dashboard/wheel-3d.tsx` — a real turning cylinder with skin grooves, momentum,
  detents): three reels חזרה/דיון/לימוד resting on the next unit not yet done for that kind
  (unit_events + completion), grey/stamped when rolled back to a done unit, dashed amber when
  skipping ahead; '+' adds a reel, reels drag to reorder with slide-into-place, ▶ starts.
  The same reels float as a mini DOCK at the bottom of every teacher page
  (`components/lesson-dock.tsx`, mounted once in app/layout.tsx; hidden on projector screens
  and on the lesson page). Started plans drive `components/lesson-strip.tsx`. State:
  lib/lesson-plan.ts (lesson_plans, unit_events). Never put lesson tools under a task.
- Everything textual on a unit is teacher-editable in place and on `/dashboard/content/[ref]`:
  worksheet questions (hide/reword/add), section titles/minutes, intro/case/source/art texts,
  unit title/subtitle/readingIntro (`unit` override), discussion question, review deck.
- The review deck editor can ask Claude for a revision (`/api/content-assist`, forced tool use);
  Claude only proposes — nothing is saved until the teacher presses save.
- The unit's discussion question is the single source of truth (deck, hub, debate board).

## Exams and exam prep (issue #7)
- `/dashboard/exams` (nav: "מבחנים"; also on the vayikra-16-5 card) — teacher-only exams (lib/exams.ts).
  Exams written ahead live in `content/exams/` and are created ONCE as drafts (exam_seeds table);
  the first: ויקרא ט״ז, 18.10.2026, 45 min. The editor autosaves (components/autosave.tsx), shows
  the answer key beside each question, and prints a clean student version and the answer key.
- Each exam has a student prep page (lib/exam-prep.ts): chapter map, terms, auto-checked practice,
  argument practice with Claude feedback. Hidden until the teacher publishes; then it is a card on
  /tasks with a countdown, the page /exams, and a "ready" badge on /me. Students get the prep WITHOUT
  answers (answers only via /api/exam-prep/*/check) and never anything of the exam itself.
- The teacher chat edits both: tools list_exams, get_exam, edit_exam, edit_exam_prep (undoable).

## Class pulse (issue #13)
- `/dashboard/exams/<examId>/pulse` ("💓 דופק כיתה", teacher only; lib/exam-pulse.ts) — metrics, readiness
  chart, per-student table (prep status/%, first-try right, chapter tasks vayikra-16-* + mikdash-live as dots,
  readiness = 50% prep + 50% tasks), hardest practice items, "💬 תזכורת" → `/messages?to=<id>&draft=…`
  (prefilled, never sent by itself). Refreshes every minute; projection mode hides every name.
  Linked on every exam card and on the dashboard while an exam is upcoming (date ahead or prep published).

## Opening decks (issue #5)
- `/dashboard/opening/<taskId | ref>` — a short cinematic opening the teacher projects at
  the start of a unit (teacher only, chrome-free). Generic player `components/opening-deck.tsx`;
  content per unit in `content/openings/` — a unit listed in its registry gets the "▶ פתיחה"
  button on its lesson card and dashboard task page. Slide kinds: reveal / question /
  challenge (timer) / map (bar filling part by part) / launch (→ class board, or back to the
  lesson page while the unit is unpublished).

## Class rules slide (issue #11)
- `/dashboard/slide` — one full-screen slide (teacher only) with the lesson's title, three blocks
  (📝 task, 📏 rules, 🏠 finished? in green) and a closing line; fits 1920×1080 without scrolling.
  Linked from the lesson page and the dashboard. Stored as one row in `class_slide`
  (lib/class-slide.ts); edited in place (corner ✏️ → side drawer, live preview) or by the teacher
  chat (get_class_slide / edit_class_slide, undoable).

## Merging duplicate accounts (issue #15)
- lib/account-merge.ts: a student with two Google accounts → "איחוד עם חשבון אחר…" on every
  student row in `/dashboard/students` (pick the account that stays, summary, confirm), or the chat's
  `account_action` merge (keepUserId + userId; not undoable). All work moves to the kept account; a
  task worked in both keeps the more advanced version (submitted, then progress %), the other goes to
  `account_merge_archive` (never deleted); exam-prep items likewise (solved, then attempts).
- The merged row stays with role 'merged' + merged_into: out of every list, and signing in with its
  email lands in the kept account (auth.ts jwt follows merged_into, also for an open session).
- One-time seeds (SEED_MERGES, run once per seed_key from ensureApprovalColumns, only if the ids still
  carry the expected emails): זוהר גינתי 16→27, נועם רחמים 10→23.

## Interim grade (issue #17)
- `/dashboard/grades/vayikra-16` ("📊 ציון ביניים — פרק ט״ז", teacher only; lib/interim-grades.ts), linked on the
  dashboard and on /dashboard/exams. Claude checks EVERY answer of every approved student in tasks 1, 2, 6, 9, 10, 11
  (submitted or not) with the teacher's lenient policy (0 only for empty / contentless / clearly contradicting the
  verses) plus a one-line note; checks are stored per answer hash (interim_answer_grades), and "בדיקה מחדש" checks only
  new or changed answers.
- Task grade = mean of the visible questions. The average covers the tasks she ticks and leaves untouched tasks out
  (or counts them as 0 — her toggle). Manual overrides per task or per student (✋), CSV export.
- Nothing reaches students unless she presses "פרסום ציונים": it writes the included task grades to grades.score
  (approved, one bell, no email) and keeps the previous rows, so "ביטול הפרסום" restores them.
