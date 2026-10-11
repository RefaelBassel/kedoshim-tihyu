"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The "compose an exam" button. Generation takes a few minutes with Opus,
// so the button shows it is working the whole time and lands the teacher
// in the editor when done.
export default function ExamList({ hasExams }: { hasExams: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const generate = async () => {
    setPhase("working");
    setError(null);
    setSeconds(0);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    try {
      const r = await fetch("/api/exams", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error ?? "חיבור המבחן נכשל");
      router.push(`/dashboard/exams/${d.exam.id}`);
      router.refresh();
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "חיבור המבחן נכשל");
    } finally {
      clearInterval(tick);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-[color:var(--accent)]/50 bg-[color:var(--card)] p-5 text-center">
      <p className="font-display text-lg font-extrabold text-[color:var(--primary)]">
        {hasExams ? "עוד טיוטה של המבחן על פרק ט״ז" : "מבחן על ויקרא ט״ז — עבודת יום הכיפורים"}
      </p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-[color:var(--foreground)]/70">
        קלוד מחבר טיוטה מתוך חמש היחידות של הפרק, כולל העריכות שלך: בקיאות בפשט, זיהוי אתנחתא, זיהוי פסוקים,
        שאלות עיון ושאלת טיעון — 100 נקודות. את עורכת כל שאלה, מחליפה מה שלא מתאים, ומדפיסה. התלמידים לא
        רואים כלום.
      </p>
      <button
        type="button"
        onClick={generate}
        disabled={phase === "working"}
        className={`mt-4 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-extrabold text-white shadow-lg transition ${
          phase === "working" ? "cursor-wait opacity-90" : "hover:scale-[1.03] active:scale-95"
        }`}
        style={{ background: "linear-gradient(135deg, var(--accent), var(--primary))" }}
      >
        {phase === "working" ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            קלוד מחבר את המבחן… {seconds} שנ׳ (בדרך כלל 2–4 דקות)
          </>
        ) : (
          <>✨ חיבור טיוטת מבחן</>
        )}
      </button>
      {phase === "error" && error && <p className="mt-2 text-xs font-bold text-[color:var(--danger)]">{error}</p>}
    </div>
  );
}
