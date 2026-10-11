import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";

// Deployment self-check (no data): are the embedded Hebrew fonts for the
// PDF export present on the serverless file system? Lets us verify the
// Vercel file tracing after a deploy without a teacher login.
export async function GET() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  const files = ["NotoSansHebrew-Regular.ttf", "NotoSansHebrew-Bold.ttf", "NotoSerifHebrew-Regular.ttf", "NotoSerifHebrew-Bold.ttf"];
  const present = Object.fromEntries(files.map((f) => [f, existsSync(path.join(dir, f))]));
  const ok = Object.values(present).every(Boolean);
  return NextResponse.json({ ok, present }, { status: ok ? 200 : 500 });
}
