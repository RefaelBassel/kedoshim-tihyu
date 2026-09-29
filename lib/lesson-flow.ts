import type { BlockKind } from "./lesson-plan";

// The lesson flows from block to block. Two screens follow the plan:
// the PROJECTOR (deck → debate board → class board) and the TEACHER's own
// device (tickets & question → class status). Everything derives from the
// current block, so an extra debate or an extra reel simply flows too.
export function projectorUrl(kind: BlockKind, taskId: number): string {
  switch (kind) {
    case "review":
      return `/dashboard/review/${taskId}`;
    case "discussion":
      return `/dashboard/discussion/${taskId}/board`;
    case "study":
      return `/dashboard/class-board/${taskId}`;
  }
}

export function teacherUrl(kind: BlockKind, taskId: number): string {
  switch (kind) {
    case "review":
      return "/dashboard/lesson";
    case "discussion":
      return `/dashboard/discussion/${taskId}/control`;
    case "study":
      return `/dashboard/task/${taskId}`;
  }
}

export const KIND_WORD: Record<BlockKind, { emoji: string; label: string }> = {
  review: { emoji: "🔁", label: "חזרה" },
  discussion: { emoji: "💬", label: "דיון" },
  study: { emoji: "📖", label: "לימוד" },
};
