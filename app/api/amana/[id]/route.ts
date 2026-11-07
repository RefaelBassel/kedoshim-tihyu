import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { deleteClause, listClauses, moveClause, updateClause } from "@/lib/amana";

// One clause (teacher only). PATCH { clause } edits it, PATCH { move: n }
// moves it to place n; DELETE removes it (the rest are renumbered).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  try {
    if (body?.move != null) await moveClause(id, Number(body.move));
    if (body?.clause) await updateClause(id, body.clause);
    return NextResponse.json({ ok: true, clauses: await listClauses() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "לא נשמר" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const id = Number((await params).id);
  const gone = await deleteClause(id);
  if (!gone) return NextResponse.json({ error: "הסעיף לא נמצא." }, { status: 404 });
  return NextResponse.json({ ok: true, clauses: await listClauses() });
}
