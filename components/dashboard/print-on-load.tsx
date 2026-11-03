"use client";

import { useEffect } from "react";

// Opens the browser's print dialog once the page (and its fonts — the verses
// need David Libre for the taamim) is ready. Skipped when the URL carries
// `auto=0`, e.g. after the teacher flips the verses option.
export default function PrintOnLoad() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auto") === "0") return;
    let cancelled = false;
    const run = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        /* print anyway */
      }
      if (!cancelled) window.setTimeout(() => window.print(), 250);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
