import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import { cleanSlide, getSlide, saveSlide } from "@/lib/class-slide";

// שקופית כללי השיעור — teacher only. GET returns the slide; PUT replaces it.
export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  return NextResponse.json({ ok: true, slide: await getSlide() });
}

export async function PUT(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const body = await req.json().catch(() => null);
  if (!body?.slide) return NextResponse.json({ error: "חסר תוכן לשקופית." }, { status: 400 });
  const slide = await saveSlide(cleanSlide(body.slide), guard.userId);
  return NextResponse.json({ ok: true, slide });
}
