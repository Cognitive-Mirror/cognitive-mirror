import Link from "next/link";
import { notFound } from "next/navigation";
import roleConfig from "@/data/roles.json";

type RoleId = "admin" | "manager" | "learner";

const roleCopy: Record<
  RoleId,
  { eyebrow: string; title: string; description: string }
> = {
  admin: {
    eyebrow: "Admin Route",
    title: "Admin workspace placeholder",
    description:
      "This destination is intentionally minimal for now. It keeps the new login flow honest while leaving a clean integration point for the future enterprise admin experience.",
  },
  manager: {
    eyebrow: "Manager Route",
    title: "Manager workspace placeholder",
    description:
      "This route will become the validation surface for capability evidence, AI review outcomes, and growth decisions. For now it confirms role-based routing cleanly.",
  },
  learner: {
    eyebrow: "Learner Route",
    title: "Learner workspace placeholder",
    description:
      "This route stands in for the future learning journey, evidence submission, and progress tracking experience while preserving the intended redirect path.",
  },
};

export function generateStaticParams() {
  return roleConfig.roles.map((role) => ({ role: role.id }));
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const matchedRole = roleConfig.roles.find((item) => item.id === role);

  if (!matchedRole || !(role in roleCopy)) {
    notFound();
  }

  const content = roleCopy[role as RoleId];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090B] px-6 py-16 text-[#FAFAFA]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(126,105,171,0.18),transparent_35%),radial-gradient(circle_at_bottom,rgba(201,162,94,0.08),transparent_24%)]" />
      <div className="relative w-full max-w-3xl rounded-[32px] border border-white/10 bg-white/8 p-8 shadow-[0_24px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl sm:p-10">
        <div className="mb-6 inline-flex rounded-full border border-[#C9A25E]/28 bg-[#C9A25E]/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-[#E8D3A8]">
          {content.eyebrow}
        </div>
        <h1 className="text-4xl font-semibold tracking-[-0.05em] text-zinc-50">
          {content.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-zinc-300">
          {content.description}
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E69AB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]"
          >
            Back to login
          </Link>
          <div className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#8B6FCF_0%,#6A58A7_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(126,105,171,0.3)]">
            {matchedRole.name} route is live
          </div>
        </div>
      </div>
    </main>
  );
}
