import { auth, updateSession } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

// First login: full Hebrew name, class (students), and the form of address
// (כינוי גוף) — the name and class show in the header, the personal page and
// the teacher dashboard; the form of address shapes every Claude reply.
export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.onboarded) redirect("/");
  const isTeacher = session.user.role === "teacher";

  async function completeOnboarding(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 80);
    const klass = String(formData.get("class") ?? "").trim().slice(0, 12);
    const addressForm = String(formData.get("addressForm") ?? "neutral");
    const valid = ["f", "m", "neutral"].includes(addressForm) ? addressForm : "neutral";
    if (!fullName) return;
    const session = await auth();
    if (!session?.user?.id) return;
    const teacher = session.user.role === "teacher";
    if (!teacher && !klass) return;
    const userId = Number(session.user.id);
    const now = Math.floor(Date.now() / 1000);
    await db().execute({
      sql: "UPDATE users SET full_name = ?, class = ?, address_form = ?, onboarded_at = ? WHERE id = ?",
      args: [fullName, klass || null, valid, now, userId],
    });
    // Late joiners get every already-published task: assignment normally
    // happens at publish time, so without this a student who signs up
    // after publication would see an empty task list (and stay invisible
    // on the class board).
    if (!teacher) {
      const tasks = await db().execute({ sql: "SELECT id FROM tasks", args: [] });
      for (const t of tasks.rows) {
        await db().execute({
          sql: `INSERT OR IGNORE INTO task_assignments (task_id, user_id, assigned_at)
                VALUES (?, ?, ?)`,
          args: [Number(t.id), userId, now],
        });
      }
    }
    // Explicitly refresh the JWT cookie so the app sees onboarded=true
    // on the next request (without this we'd get a redirect loop).
    await updateSession({
      user: { onboarded: true, fullName, addressForm: valid },
    });
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-8 shadow-sm">
        <h1 className="font-display text-center text-2xl font-bold text-[color:var(--primary)]">
          ברוכים הבאים לקדושים תהיו!
        </h1>
        <p className="mt-2 text-center text-sm text-[color:var(--primary)]/70">
          איך קוראים לך ובאיזו כיתה? השם המלא בעברית הוא שיופיע בעמוד האישי,
          בהאדר ובדשבורד המורה.
        </p>

        <form action={completeOnboarding} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="fullName"
              className="mb-1 block text-sm font-medium text-[color:var(--primary)]"
            >
              שם מלא בעברית
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              autoComplete="name"
              placeholder="לדוגמה: דניאל כהן"
              className="w-full rounded-lg border border-[color:var(--border)] bg-white px-4 py-2 text-right outline-none transition focus:border-[color:var(--accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="class"
              className="mb-1 block text-sm font-medium text-[color:var(--primary)]"
            >
              כיתה {isTeacher && <span className="text-xs font-normal text-[color:var(--primary)]/55">(למורים — לא חובה)</span>}
            </label>
            <input
              id="class"
              name="class"
              type="text"
              required={!isTeacher}
              maxLength={12}
              placeholder="לדוגמה: ט2"
              className="w-full rounded-lg border border-[color:var(--border)] bg-white px-4 py-2 text-right outline-none transition focus:border-[color:var(--accent)]"
            />
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-[color:var(--primary)]">
              איך לפנות אליך באתר? (גם קלוד, העוזר החכם, יכתוב כך)
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "f", label: "לשון נקבה", example: "נסי, קראי" },
                { value: "m", label: "לשון זכר", example: "נסה, קרא" },
                { value: "neutral", label: "ניטרלי", example: "נסו, קראו" },
              ].map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer flex-col items-center gap-0.5 rounded-xl border border-[color:var(--border)] px-2 py-2.5 text-center transition has-[:checked]:border-[color:var(--primary)] has-[:checked]:bg-[color:var(--primary)]/8"
                >
                  <input
                    type="radio"
                    name="addressForm"
                    value={o.value}
                    defaultChecked={o.value === "neutral"}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold text-[color:var(--primary)]">
                    {o.label}
                  </span>
                  <span className="text-[10px] text-[color:var(--primary)]/55">
                    {o.example}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            className="w-full rounded-xl bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90"
          >
            המשך לאתר
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[color:var(--primary)]/60">
          המידע נשמר רק לצורכי הלימוד והמורה, ולא נחשף לאחרים.
        </p>
      </div>
    </main>
  );
}
