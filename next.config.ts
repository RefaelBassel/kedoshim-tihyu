import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the PDF renderer ships its own layout engine; keep it out of the bundler
  serverExternalPackages: ["@react-pdf/renderer"],
  // the Hebrew fonts the exam export embeds (read at runtime from disk)
  outputFileTracingIncludes: { "/api/exams/[examId]/export": ["./assets/fonts/**"], "/api/exams/fonts-check": ["./assets/fonts/**"] },
  /* config options here */
};

export default nextConfig;
