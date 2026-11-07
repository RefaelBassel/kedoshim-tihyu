import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { toggleVote } from "@/lib/amana";

// 👍 for a proposal shown to the class — one per unit per student; the same
// proposal again takes the vote back.
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.guest) return NextResponse.json({ error: "נדרשת התחברות." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const proposalId = Number(body?.proposalId);
  if (!Number.isFinite(proposalId)) return NextResponse.json({ error: "חסרה הצעה." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await toggleVote(Number(user.id), proposalId)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "לא נשמר" }, { status: 400 });
  }
}
