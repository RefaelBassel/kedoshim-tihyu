"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-[color:var(--primary)] px-4 py-1.5 text-xs font-extrabold text-white transition hover:scale-[1.03] active:scale-95"
    >
      🖨 הדפסה / שמירה כ-PDF
    </button>
  );
}
