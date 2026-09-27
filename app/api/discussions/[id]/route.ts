import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/api-auth";
import {
  addNote,
  closeDiscussion,
  deleteNote,
  getDiscussionState,
  refreshEligibility,
  reopenDiscussion,
  setApproved,
  setQuestion,
  setSeconds,
  startTurn,
  stopTurn,
} from "@/lib/discussion";

// One discussion's live state (polled by the board and the control page)
// and the teacher's actions on it. Teacher only on both verbs — the board
// runs in the teacher's own browser on the projector.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  const state = await getDiscussionState(Number(id));
  if (!state) return NextResponse.json({ error: "הדיון לא נמצא." }, { status: 404 });
  return NextResponse.json({ ok: true, state });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const { id: raw } = await params;
  const id = Number(raw);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  switch (action) {
    case "approve":
      await setApproved(id, Number(body.userId), Boolean(body.approved));
      break;
    case "start":
      await startTurn(id, body.userId != null ? Number(body.userId) : null, String(body.name ?? ""));
      break;
    case "stop":
      await stopTurn(id);
      break;
    case "note": {
      const text = String(body.text ?? "").trim();
      if (!text) return NextResponse.json({ error: "אין טקסט." }, { status: 400 });
      const tag = body.tag === "claim" || body.tag === "reason" ? body.tag : null;
      await addNote(id, String(body.speaker ?? "").trim() || "—", text, tag);
      break;
    }
    case "deleteNote":
      await deleteNote(id, Number(body.noteId));
      break;
    case "seconds":
      await setSeconds(id, Number(body.seconds));
      break;
    case "question":
      await setQuestion(id, String(body.question ?? ""));
      break;
    case "refresh":
      await refreshEligibility(id);
      break;
    case "close":
      await closeDiscussion(id);
      break;
    case "reopen":
      await reopenDiscussion(id);
      break;
    default:
      return NextResponse.json({ error: "פעולה לא ידועה." }, { status: 400 });
  }
  const state = await getDiscussionState(id);
  return NextResponse.json({ ok: true, state });
}
