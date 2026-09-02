# קדושים תהיו — kedoshim-tihyu

Learning site for 9th-grade Tanach at תיכון שחרית: *איך נראית חברה מתוקנת על פי
ספרים ויקרא ושמואל ב*. Sister site of בינת התורה (`../tanach`) — same
architecture (Next.js 16, Auth.js, Turso), separate accounts and content.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the keys
node scripts/migrate.mjs           # creates local.db
npm run dev
```

Open http://localhost:3000. In development a "כניסת פיתוח" form on /login
signs in any email without Google (teacher emails from `lib/roles.ts` get the
teacher role).

## Layout

- `content/tasks/` — static task content (`vayikra-16-*.ts`), the verse text
  with taamim (`vayikra-16-verses.ts`), the registry and the content model.
- `components/task/task-runner.tsx` — the interactive task page (simple and
  full modes), word menu, Claude assist panel, taamim tools.
- `app/api/assist` — Claude help ("אני עשיתי לבד אבל לא פגשתי קיר").
- `public/audio/tanach/` — Shmuelof narration + `audio-map.json` verse spans
  (`scripts/asr_align_verses.py`, `scripts/verify_spans.py`).
- `migrations/` — additive SQL, applied by `scripts/migrate.mjs`.

See `CLAUDE.md` for the working rules, palette, roles and curriculum.
