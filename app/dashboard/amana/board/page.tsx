import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AmanaBoard from "@/components/amana/amana-board";
import { listClauses, publicClause, type PublicClause } from "@/lib/amana";

// אמנת הכיתה — projector mode (teacher only, chrome-free, input-free). A
// clause added during the lesson is "written" onto the screen.
export default async function AmanaBoardPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher" || user.guest) redirect("/amana");
  let clauses: PublicClause[] = [];
  try {
    clauses = (await listClauses()).map(publicClause);
  } catch {
    // DB not ready
  }
  return <AmanaBoard initial={clauses} />;
}
