import path from "node:path";
import { readFileSync } from "node:fs";
import React from "react";
import { Document as PdfDocument, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ExamDoc, ExamRow } from "./exams";
import { totalPoints } from "./exams";
import { linesFor, partHeading, type ExamVersion } from "./exam-export-shared";

// -------------------------------------------------------------- PDF ------
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "NotoSansHebrew",
    fonts: [
      { src: path.join(dir, "NotoSansHebrew-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSansHebrew-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "NotoSerifHebrew",
    fonts: [
      { src: path.join(dir, "NotoSerifHebrew-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSerifHebrew-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // no hyphenation of Hebrew words
  Font.registerHyphenationCallback((word) => [word]);
  // make sure the files are traced into the serverless bundle
  readFileSync(path.join(dir, "NotoSansHebrew-Regular.ttf"));
  fontsReady = true;
}

const S = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontFamily: "NotoSansHebrew", fontSize: 11, textAlign: "right", direction: "rtl" } as const,
  small: { fontSize: 9, color: "#444", textAlign: "right", direction: "rtl" },
  title: { fontSize: 20, fontWeight: 700, marginTop: 4, textAlign: "right", direction: "rtl" },
  subtitle: { fontSize: 12, marginBottom: 6, textAlign: "right", direction: "rtl" },
  meta: { fontSize: 10, marginTop: 6, textAlign: "right", direction: "rtl" },
  box: { backgroundColor: "#f2f2f2", padding: 6, marginTop: 6, borderRadius: 3 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: "#000", marginVertical: 10 },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 2, textAlign: "right", direction: "rtl" },
  intro: { fontSize: 10, marginBottom: 6, textAlign: "right", direction: "rtl" },
  q: { fontSize: 11, marginTop: 8, lineHeight: 1.5, textAlign: "right", direction: "rtl" },
  verse: { fontFamily: "NotoSerifHebrew", fontSize: 12.5, lineHeight: 1.7, padding: 6, borderWidth: 0.8, borderColor: "#777", marginTop: 6, textAlign: "right", direction: "rtl" },
  answer: { fontSize: 10, lineHeight: 1.45, backgroundColor: "#eef3ee", padding: 5, marginTop: 4, textAlign: "right", direction: "rtl" },
  line: { borderBottomWidth: 0.7, borderBottomColor: "#999", height: 20 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 9, color: "#666", textAlign: "center", direction: "rtl" },
});

function ExamPdf({ doc, version }: { doc: ExamDoc; version: ExamVersion }) {
  return (
    <PdfDocument title={doc.title} author="קדושים תהיו">
      <Page size="A4" style={S.page}>
        <Text style={S.small}>תיכון שחרית · בית מדרש תורה שבכתב · כיתה ט</Text>
        <Text style={S.title}>{doc.title}</Text>
        {doc.subtitle ? <Text style={S.subtitle}>{doc.subtitle}</Text> : null}
        <Text style={S.meta}>
          {`שם: ______________________   כיתה: ________   תאריך: ____________   משך: ${doc.durationMin} דק׳   סה״כ: ${totalPoints(doc)} נק׳`}
        </Text>
        {doc.instructions ? (
          <View style={S.box}>
            <Text style={{ fontSize: 10, lineHeight: 1.5, textAlign: "right", direction: "rtl" }}>{doc.instructions}</Text>
          </View>
        ) : null}
        {version === "teacher" ? <Text style={{ fontSize: 10, fontWeight: 700, marginTop: 6, textAlign: "right", direction: "rtl" }}>גרסת מורה — עם תשובות ומחוון</Text> : null}
        <View style={S.rule} />
        {doc.sections.map((s, si) => {
          const pts = s.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
          return (
            <View key={s.key} wrap>
              <Text style={S.h2}>{partHeading(si, s.title, pts)}</Text>
              {s.intro ? <Text style={S.intro}>{s.intro}</Text> : null}
              {s.questions.map((q, qi) => (
                <View key={q.id} wrap={false}>
                  {q.verse ? <Text style={S.verse}>{`(${q.verseNum}) ${q.verse}`}</Text> : null}
                  <Text style={S.q}>{`${qi + 1}. ${q.text} (${q.points} נק׳)`}</Text>
                  {version === "teacher" ? (
                    <Text style={S.answer}>{`✔ ${q.answer}`}</Text>
                  ) : (
                    Array.from({ length: linesFor(s.key) }).map((_, i) => <View key={i} style={S.line} />)
                  )}
                </View>
              ))}
            </View>
          );
        })}
        <Text style={{ fontSize: 11, fontWeight: 700, marginTop: 18, textAlign: "center", direction: "rtl" }}>בהצלחה!</Text>
        <Text style={S.footer} render={({ pageNumber, totalPages }) => `עמוד ${pageNumber} מתוך ${totalPages}`} fixed />
      </Page>
    </PdfDocument>
  );
}

export async function examToPdf(exam: ExamRow, version: ExamVersion): Promise<Buffer> {
  registerFonts();
  const buf = await renderToBuffer(<ExamPdf doc={exam.doc} version={version} />);
  return Buffer.from(buf);
}
