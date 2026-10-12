import type { ExamDoc } from "@/lib/exams";
import type { PrepDoc } from "@/lib/exam-prep";
import { vayikra16Exam, vayikra16Prep } from "./vayikra-16";

// Exams written ahead of time. Each is created once (lib/exams.ts →
// ensureSeedExams) as a draft with its preparation page, also a draft.
export interface ExamSeed {
  key: string;
  exam: () => Promise<ExamDoc>;
  prep: () => Promise<PrepDoc>;
}

export const EXAM_SEEDS: ExamSeed[] = [{ key: "vayikra-16-2026-10-18", exam: vayikra16Exam, prep: vayikra16Prep }];
