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

// Which block comes after the current one: the first block further on that
// was not run yet; when there is none, the first earlier one she skipped;
// -1 when every block was run. The order is hers — she may jump anywhere —
// so "next" always means "the next thing still waiting".
export function nextIndex(plan: { blocks: { done?: boolean }[]; current: number }): number {
  const n = plan.blocks.length;
  for (let i = plan.current + 1; i < n; i++) if (!plan.blocks[i].done) return i;
  for (let i = 0; i < plan.current && i < n; i++) if (!plan.blocks[i].done) return i;
  return -1;
}
