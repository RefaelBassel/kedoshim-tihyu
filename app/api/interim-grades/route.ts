import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { checkPending, publish, saveSettings, setOverride, unpublish } from "@/lib/interim-grades";

// Interim grade of ויקרא ט״ז (issue #17) — teacher only. One POST, by action:
//   check     — Claude checks new / changed answers (a time-boxed batch)
//   settings  — which tasks enter the average, untouched = 0 or left out
//   override  — the teacher's own grade for a task (taskId) or the unit (taskId 0)
//   publish / unpublish — write the task grades to grades.score, or restore
export const maxDuration = 800;

export async function POST(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");

  switch (action) {
    case "check": {
      const r = await checkPending();
      if (r.error) return NextResponse.json(r, { status: 502 });
      return NextResponse.json({ ok: true, ...r });
    }
    case "settings": {
      const include = Array.isArray(body?.include) ? body.include.map(Number).filter(Number.isInteger) : [];
      await saveSettings({ include, missingAsZero: Boolean(body?.missingAsZero) });
      return NextResponse.json({ ok: true });
    }
    case "override": {
      const userId = Number(body?.userId);
      const taskId = Number(body?.taskId ?? 0);
      const raw = body?.score;
      const score = raw == null || raw === "" ? null : Number(raw);
      if (!Number.isInteger(userId) || !Number.isInteger(taskId) || (score != null && (!Number.isFinite(score) || score < 0 || score > 100))) {
        return NextResponse.json({ error: "ציון בין 0 ל-100." }, { status: 400 });
      }
      await setOverride(userId, taskId, score, guard.userId);
      return NextResponse.json({ ok: true });
    }
    case "publish":
      return NextResponse.json({ ok: true, count: await publish(guard.userId) });
    case "unpublish":
      return NextResponse.json({ ok: true, count: await unpublish() });
    default:
      return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });
  }
}
