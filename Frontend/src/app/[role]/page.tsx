import { notFound } from "next/navigation";
import { ROLES } from "@/lib/auth";
import { CapabilityWorkspace } from "@/components/CapabilityWorkspace";

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

  return <CapabilityWorkspace role={matchedRole.id} />;
}
