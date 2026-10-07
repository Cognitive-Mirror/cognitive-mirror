import type { LucideIcon } from "lucide-react";

export function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border t-border t-subtle p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs t-muted">{label}</span>
        <Icon className="h-4 w-4 text-indigo-400" />
      </div>
      <p className="text-2xl font-semibold tracking-tight t-fg">{value}</p>
      <p className="mt-1 text-xs t-subtle-fg">{detail}</p>
    </div>
  );
}
