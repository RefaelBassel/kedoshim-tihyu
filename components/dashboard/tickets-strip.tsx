"use client";

import { useEffect, useState } from "react";

// The entry tickets to a debate, at a glance: who holds one (answered the
// whole unit, or was given one by hand) and who is still without. Shown the
// moment a lesson starts, on the running bar, for the debate that is on or
// the next one coming — so the teacher knows before the debate begins.
export interface TicketPerson {
  userId: number;
  name: string;
  answered: number;
  total: number;
  ticket: boolean;
  manual: boolean;
}
export interface TicketsData {
  taskId: number;
  title: string;
  discussionId: number | null;
  holders: TicketPerson[];
  waiting: TicketPerson[];
}

export function useTickets(taskId: number | null) {
  const [data, setData] = useState<TicketsData | null>(null);
  useEffect(() => {
    if (taskId == null) return;
    let alive = true;
    const load = () =>
      fetch(`/api/lesson-plan/tickets?taskId=${taskId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (alive && d.ok) setData(d);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [taskId]);
  return data;
}

export function Ticket({ name, sub, held, active, small, onClick, title }: { name: string; sub?: string; held: boolean; active?: boolean; small?: boolean; onClick?: () => void; title?: string }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={`relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-md border text-start transition ${small ? "px-2 py-0.5 ps-3.5 text-[11px]" : "px-3 py-1.5 ps-4 text-xs"} ${
        active
          ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white shadow"
          : held
            ? "border-[color:var(--accent)]/70 text-[color:var(--primary)]"
            : "border-dashed border-[color:var(--border)] text-[color:var(--primary)]/55"
      } ${onClick ? "hover:scale-[1.02] active:scale-95" : ""}`}
      style={{
        background: active ? undefined : held ? "linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, var(--card)) 0 7px, color-mix(in srgb, var(--accent) 9%, var(--card)) 7px)" : "var(--background)",
      }}
    >
      {/* the tear-off stub: a perforation down the right edge */}
      <span aria-hidden className="absolute inset-y-0 right-[7px] border-r border-dashed" style={{ borderColor: active ? "rgba(255,255,255,0.55)" : held ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--border)" }} />
      <span className={`${held ? "" : "opacity-60"}`} aria-hidden>{held ? "🎫" : "▫️"}</span>
      <span className="font-bold">{name}</span>
      {sub && <span className={`${active ? "text-white/85" : "opacity-65"} ${small ? "text-[10px]" : "text-[11px]"}`}>{sub}</span>}
    </Tag>
  );
}

export default function TicketsStrip({ taskId, heading, compact = false }: { taskId: number; heading: string; compact?: boolean }) {
  const data = useTickets(taskId);
  if (!data) return <p className="text-[11px] text-[color:var(--primary)]/45">🎫 בודקים למי יש כרטיס כניסה…</p>;
  const total = data.holders.length + data.waiting.length;
  return (
    <div className="rounded-xl border border-[color:var(--accent)]/40 px-3 py-2" style={{ background: "color-mix(in srgb, var(--accent) 6%, var(--card))" }}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={`font-extrabold text-[color:var(--primary)] ${compact ? "text-xs" : "text-sm"}`}>
          🎫 {heading} · <span className="text-[color:var(--accent)]">{data.holders.length}</span>
          <span className="text-[color:var(--primary)]/55"> מתוך {total} עם כרטיס</span>
        </p>
        <a href={`/dashboard/discussion/${data.taskId}/control`} className="text-[11px] font-bold text-[color:var(--accent)] hover:underline">
          לתת כרטיסים ידנית ולערוך את השאלה ←
        </a>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.holders.map((p) => (
          <Ticket key={p.userId} name={p.name} held small={compact} sub={p.manual ? "ניתן ידנית" : undefined} />
        ))}
        {data.waiting.map((p) => (
          <Ticket key={p.userId} name={p.name} held={false} small={compact} sub={`${p.answered}/${p.total}`} title={`ענה/תה על ${p.answered} מתוך ${p.total} שאלות`} />
        ))}
        {total === 0 && <span className="text-[11px] text-[color:var(--primary)]/50">היחידה עוד לא הוקצתה לאף אחד.</span>}
      </div>
    </div>
  );
}
