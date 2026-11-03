// "🖨️ הדפסה" — opens the clean print page of a unit's worksheet in a new tab
// (teacher only: render it only on teacher surfaces). Optional `student` +
// `taskId` print one student's submission instead of the blank worksheet.
export default function PrintWorksheetLink({
  contentRef,
  studentId,
  taskId,
  label = "🖨️ הדפסה",
  variant = "pill",
}: {
  contentRef: string;
  studentId?: number;
  taskId?: number;
  label?: string;
  variant?: "pill" | "outline" | "text";
}) {
  const qs = studentId != null && taskId != null ? `?student=${studentId}&task=${taskId}` : "";
  const cls =
    variant === "pill"
      ? "rounded-full border-2 border-[color:var(--primary)] px-4 py-1.5 text-sm font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10"
      : variant === "outline"
        ? "rounded-full border border-[color:var(--border)] px-3 py-1 text-[color:var(--primary)]"
        : "text-sm font-semibold text-[color:var(--primary)] underline-offset-2 hover:underline";
  return (
    <a
      href={`/dashboard/print/${encodeURIComponent(contentRef)}${qs}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      title="דף עבודה נקי להדפסה או לשמירה כ-PDF"
    >
      {label}
    </a>
  );
}
