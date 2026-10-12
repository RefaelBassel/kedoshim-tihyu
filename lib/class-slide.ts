import { db } from "./db";
import { DEFAULT_SLIDE, cleanSlide, type SlideDoc } from "./class-slide-shared";

// שקופית כללי השיעור — one slide the teacher projects at the start of a
// lesson: a title, three blocks (the task, the rules, "finished?") and a
// small closing line. Teacher only; edited in place on /dashboard/slide and
// by the teacher chat (edit_class_slide). Until the first save the default
// is shown.
export * from "./class-slide-shared";

let ready = false;
async function ensureTable() {
  if (ready) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS class_slide (
       id INTEGER PRIMARY KEY,
       doc_json TEXT NOT NULL,
       updated_by INTEGER,
       updated_at INTEGER NOT NULL
     )`
  );
  ready = true;
}

export async function getSlide(): Promise<SlideDoc> {
  await ensureTable();
  const res = await db().execute("SELECT doc_json FROM class_slide WHERE id = 1");
  if (!res.rows.length) return DEFAULT_SLIDE;
  try {
    return cleanSlide(JSON.parse(String(res.rows[0].doc_json)));
  } catch {
    return DEFAULT_SLIDE;
  }
}

export async function saveSlide(doc: SlideDoc, teacherId: number): Promise<SlideDoc> {
  await ensureTable();
  const clean = cleanSlide(doc);
  await db().execute({
    sql: `INSERT INTO class_slide (id, doc_json, updated_by, updated_at) VALUES (1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET doc_json = excluded.doc_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [JSON.stringify(clean), teacherId, Math.floor(Date.now() / 1000)],
  });
  return clean;
}
