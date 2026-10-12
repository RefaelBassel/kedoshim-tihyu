import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getSlide } from "@/lib/class-slide";
import ClassSlide from "@/components/class-slide";

// שקופית כללי השיעור — teacher only, chrome-free (a fixed full-viewport
// overlay like the opening deck). Projected at the start of a lesson.
export default async function ClassSlidePage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  if (user.role !== "teacher" || user.guest) redirect("/");

  return <ClassSlide initial={await getSlide()} />;
}
