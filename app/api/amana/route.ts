import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTeacher } from "@/lib/api-auth";
import { addClause, listClauses, publicClause, setClauseOrder } from "@/lib/amana";

// אמנת הכיתה. GET: the clauses (signed-in users; meeting notes for teachers
// only). POST: add a clause (teacher). PUT { order: ids }: reorder (teacher).
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return NextResponse.json({ error: "נדרשת התחברות." }, { status: 401 });
  const clauses = await listClauses();
  const isTeacher = user.role === "teacher" && !user.guest;
  return NextResponse.json({ ok: true, clauses: isTeacher ? clauses : clauses.map(publicClause) });
}

export async function POST(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => null);
  try {
    const clause = await addClause(body?.clause ?? {}, guard.userId, body?.position != null ? Number(body.position) : undefined);
    return NextResponse.json({ ok: true, clause, clauses: await listClauses() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "לא נשמר" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.order)) return NextResponse.json({ error: "חסר סדר." }, { status: 400 });
  await setClauseOrder((body.order as unknown[]).map(Number).filter(Number.isFinite));
  return NextResponse.json({ ok: true, clauses: await listClauses() });
}
