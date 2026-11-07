import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markClausesSeen } from "@/lib/amana";

// The viewer has seen every clause so far — the "חדש!" badges go away next time.
export async function POST() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.guest) return NextResponse.json({ error: "נדרשת התחברות." }, { status: 401 });
  await markClausesSeen(Number(user.id));
  return NextResponse.json({ ok: true });
}
