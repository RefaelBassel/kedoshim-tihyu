import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrep, type PrepRow } from "./exam-prep";

// Guard for the student prep APIs: a signed-in user, a prep the teacher
// published (a teacher may also try a draft). The exam is never reachable.
export async function requirePrep(prepIdRaw: string): Promise<
  | { ok: true; prep: PrepRow; user: { id: number; addressForm: string | null; fullName: string | null } }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.guest) return { ok: false, res: NextResponse.json({ error: "נדרשת התחברות." }, { status: 401 }) };
  const prep = await getPrep(Number(prepIdRaw));
  if (!prep || (prep.status !== "published" && user.role !== "teacher")) {
    return { ok: false, res: NextResponse.json({ error: "דף ההכנה לא נמצא." }, { status: 404 }) };
  }
  return { ok: true, prep, user: { id: Number(user.id), addressForm: user.addressForm ?? null, fullName: user.fullName ?? null } };
}
