"use client";

import { useEffect } from "react";
import type { LessonPlan } from "@/lib/lesson-plan";
import type { BlockKind } from "@/lib/lesson-plan";
import { projectorUrl } from "@/lib/lesson-flow";

// Mounted on every projector screen (deck, debate board, class board). It
// watches today's plan; the moment the current block changes — from the
// teacher's phone, from the deck's last slide, from the control page — the
// projector moves to the next block's screen by itself.
export default function LessonFollower({ kind, taskId }: { kind: BlockKind; taskId: number }) {
  useEffect(() => {
    let alive = true;
    const here = projectorUrl(kind, taskId);
    const check = () =>
      fetch("/api/lesson-plan", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { ok?: boolean; plan?: LessonPlan }) => {
          if (!alive || !d.ok || !d.plan) return;
          const p = d.plan;
          if (p.current < 0 || p.blocks.length === 0) return;
          const cur = p.blocks[p.current];
          const target = projectorUrl(cur.kind, cur.taskId);
          if (target !== here) window.location.replace(target);
        })
        .catch(() => {});
    check();
    const iv = setInterval(check, 2500);
    window.addEventListener("lesson-plan-changed", check);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("lesson-plan-changed", check);
    };
  }, [kind, taskId]);
  return null;
}
