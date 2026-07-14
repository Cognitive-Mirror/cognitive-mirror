import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ROLES } from "@/lib/auth";

interface PageProps {
  params: Promise<{ role: string }>;
}

export async function generateStaticParams() {
  return [
    { role: "admin" },
    { role: "learner" },
    { role: "manager" },
  ];
}

export default async function RolePage({ params }: PageProps) {
  const { role } = await params;
  const matchedRole = ROLES.find((r) => r.id === role);

  if (!matchedRole) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-3xl rounded-[32px] border border-white/8 bg-[#111113] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.45)] sm:p-10">
        <div className="mb-8 inline-flex rounded-full border border-indigo-400/24 bg-indigo-500/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-indigo-200">
          {matchedRole.name} Route
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-zinc-50">
            {matchedRole.name} workspace placeholder
          </h1>
          <p className="max-w-2xl text-base leading-8 text-zinc-400">
            This route is intentionally lightweight for now. It confirms the mocked login flow and gives the future {matchedRole.id} experience a stable integration point.
          </p>
        </div>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-100 transition hover:bg-white/8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Link>
          <div className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(99,102,241,0.28)]">
            Dashboard placeholder ready
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </main>
  );
}
