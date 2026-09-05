import { printFiles } from "@/content/tasks/registry";

// "גרסה להדפסה" — PDF for printing as is, Word for the teacher to edit.
// Rendered wherever a task is shown (task page, teacher task page).
export default function PrintLinks({
  contentRef,
  compact,
}: {
  contentRef: string;
  compact?: boolean;
}) {
  const files = printFiles(contentRef);
  if (!files) return null;
  const cls =
    "inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1 text-[11px] font-semibold text-[color:var(--primary)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]";
  return (
    <span className={compact ? "inline-flex flex-wrap items-center gap-1.5" : "inline-flex flex-wrap items-center justify-center gap-2"}>
      {!compact && (
        <span className="text-[11px] text-[color:var(--primary)]/55">🖨️ גרסה להדפסה:</span>
      )}
      <a href={files.pdf} download className={cls} title="להדפסה כפי שהוא">
        PDF
      </a>
      <a href={files.docx} download className={cls} title="קובץ Word הניתן לעריכה">
        Word
      </a>
    </span>
  );
}
