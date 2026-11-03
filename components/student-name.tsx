// A student's name in a teacher list. An account with no name falls back to
// its email (lib/tasks.ts and friends) — shown in grey, left-to-right, so the
// teacher spots it and can name it in /dashboard/students (issue #19).
export default function StudentName({ name }: { name: string }) {
  if (!name.includes("@")) return <>{name}</>;
  return (
    <span className="font-normal text-[color:var(--foreground)]/45" dir="ltr" title="לחשבון הזה אין שם — אפשר לקבוע אותו ברשימת התלמידים">
      {name}
    </span>
  );
}
