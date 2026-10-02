// Sanity check of the task content registry: refs match keys, block keys are
// unique inside a task, field keys unique inside a block, every helpVerses and
// main passage actually carries verses, and unit/order pairs are consistent.
// Run: npx tsx scripts/check-content.mts
import { TASK_REGISTRY } from "../content/tasks/registry";

let problems = 0;
const say = (msg: string) => {
  problems++;
  console.log("  ✗", msg);
};

for (const [key, reg] of Object.entries(TASK_REGISTRY)) {
  const c = reg.content;
  if (c.ref !== key) say(`${key}: ref is ${c.ref}`);
  if (!reg.mainPassage.verses?.length) say(`${key}: main passage has no verses`);
  const blockKeys = new Set<string>();
  let questions = 0;
  for (const s of c.sections) {
    for (const b of s.blocks) {
      if (blockKeys.has(b.key)) say(`${key}: duplicate block key ${b.key}`);
      blockKeys.add(b.key);
      if (b.type === "question") {
        questions++;
        const fk = new Set<string>();
        for (const f of b.fields ?? []) {
          if (fk.has(f.key)) say(`${key}/${b.key}: duplicate field key ${f.key}`);
          fk.add(f.key);
        }
        if (b.helpVerses && !b.helpVerses.verses.length) say(`${key}/${b.key}: empty helpVerses`);
        if (!b.prompt.trim()) say(`${key}/${b.key}: empty prompt`);
      }
    }
  }
  if (!c.discussion?.question) say(`${key}: no discussion question`);
  if (!c.review?.points?.length) say(`${key}: no review points`);
  console.log(`${key.padEnd(14)} ${String(questions).padStart(2)} questions · ${c.unit} · ${c.order}`);
}

// unit/order consistency
const byUnit = new Map<string, number[]>();
for (const reg of Object.values(TASK_REGISTRY)) {
  const u = reg.content.unit ?? "?";
  byUnit.set(u, [...(byUnit.get(u) ?? []), reg.content.order ?? 0]);
}
for (const [u, orders] of byUnit) {
  const sorted = [...orders].sort((a, b) => a - b);
  const expected = sorted.map((_, i) => i + 1);
  if (JSON.stringify(sorted) !== JSON.stringify(expected)) say(`${u}: orders ${orders.join(",")}`);
}
console.log(`\n${Object.keys(TASK_REGISTRY).length} tasks in ${byUnit.size} units · ${problems} problems`);
process.exit(problems ? 1 : 0);
