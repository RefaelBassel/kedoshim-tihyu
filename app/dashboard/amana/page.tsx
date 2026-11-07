import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageShell from "@/components/page-shell";
import AmanaAdmin from "@/components/dashboard/amana-admin";
import { TASK_REGISTRY } from "@/content/tasks/registry";
import { todayIsrael } from "@/lib/lesson-plan";
import { listClauses, proposalsForUnit, proposalsOverview, type Clause, type UnitProposals } from "@/lib/amana";

// אמנת הכיתה — the teacher's desk (teacher only). ?unit=<ref> (from the
// lesson page's "📜 סעיף לאמנה") opens on that unit's proposals.
export default async function AmanaDashboardPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher" || user.guest) redirect("/amana");

  const sp = await searchParams;
  const focusUnit = sp.unit && TASK_REGISTRY[sp.unit] ? sp.unit : null;

  let clauses: Clause[] = [];
  let units: UnitProposals[] = [];
  try {
    clauses = await listClauses();
    units = await proposalsOverview();
    // the focused unit is listed even before it has a charter question
    if (focusUnit && !units.some((u) => u.ref === focusUnit)) {
      const p = await proposalsForUnit(focusUnit);
      if (p) units = [p, ...units];
    }
  } catch {
    // DB not ready
  }

  const unitOptions = Object.entries(TASK_REGISTRY).map(([ref, r]) => ({
    ref,
    label: `${r.content.unit ? `${r.content.unit} · ` : ""}${r.content.order ? `משימה ${r.content.order}: ` : ""}${r.content.title}`,
  }));

  return (
    <PageShell title="📜 אמנת הכיתה — ניהול" subtitle="הסעיפים, הצעות התלמידים, מעקב מול ההנהלה, הקרנה והדפסה">
      <AmanaAdmin initialClauses={clauses} initialUnits={units} unitOptions={unitOptions} focusUnit={focusUnit} today={todayIsrael()} />
    </PageShell>
  );
}
