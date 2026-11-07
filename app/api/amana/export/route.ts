import { requireTeacher } from "@/lib/api-auth";
import { charterText, listClauses } from "@/lib/amana";

// Plain-text export of the charter (teacher only), for designing it in
// another tool. Approved clauses only; ?all=1 = every clause.
export async function GET(req: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.res;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const clauses = (await listClauses()).filter((c) => all || c.status === "approved");
  const BOM = String.fromCharCode(0xfeff); // so Windows editors read the Hebrew as UTF-8
  return new Response(BOM + charterText(clauses), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="amana${all ? "-all" : ""}.txt"`,
    },
  });
}
