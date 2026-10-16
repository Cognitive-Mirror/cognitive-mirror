"use client";

/**
 * Governance view: the approved rubric, grouped by capability, with the D6
 * requirement layers and tenant-wide coverage.
 *
 * Coverage is a distribution, never an average (D2): levels are ordinal.
 */

import { Layers, Scale, ShieldCheck } from "lucide-react";

import { Card, ErrorNote, Loading } from "@/components/AppShell";
import { RubricCitation } from "@/components/RubricCitation";
import { useResource } from "@/lib/useResource";
import { formatLevel, getGovernanceMatrix, type MatrixCapability } from "@/services/api";

const LEVELS = ["novice", "developing", "competent", "proficient", "expert"];

const SOURCE_LABEL: Record<string, string> = {
  spine_default: "Default · Impact Spine",
  tenant_role: "Role override · client",
  program_target: "Programme target",
};

const KIND_ORDER = [
  "capability_definition",
  "behavioural_indicator",
  "evidence_rubric",
  "validation_guidance",
  "kpi_definition",
];

export function RubricMatrix() {
  const { data, error, loading, reload } = useResource(getGovernanceMatrix);

  if (loading && !data) return <Loading label="Loading the capability matrix…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={ShieldCheck} label="Approved clauses" value={String(data.approved_clause_count)}
          detail={Object.entries(data.clauses_by_kind).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(" · ")} />
        <Stat icon={Scale} label="Required-level resolution" value="3 layers"
          detail={data.resolution_order.map((s) => SOURCE_LABEL[s] ?? s).join(" < ")} />
        <Stat icon={Layers} label="Governance constants" value={`v${data.scoring_model_version}`}
          detail={`Unvalidated confidence ceiling ${data.unvalidated_ceiling.toFixed(2)} · coverage floor ${data.coverage_confidence_floor.toFixed(2)}`} />
      </div>

      {data.capabilities.map((c) => <CapabilityBlock key={c.id} capability={c} />)}

      {data.shared_clauses.length > 0 && (
        <Card>
          <h3 className="font-semibold t-fg">Shared KPI clauses</h3>
          <p className="mt-1 text-xs t-subtle-fg">Association only, never causation. Cited across capabilities.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.shared_clauses.map((cl) => <RubricCitation key={cl.slug} slug={cl.slug} />)}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Layers; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-center justify-between text-xs t-muted">
        {label} <Icon className="h-4 w-4 text-indigo-400" />
      </div>
      <p className="mt-2 text-2xl font-semibold t-fg">{value}</p>
      <p className="mt-1 text-[11px] leading-4 t-subtle-fg">{detail}</p>
    </div>
  );
}

function CapabilityBlock({ capability: c }: { capability: MatrixCapability }) {
  const total = c.coverage.subject_count || 1;
  const byKind = KIND_ORDER.map((k) => [k, c.clauses.filter((cl) => cl.kind === k)] as const).filter(([, v]) => v.length);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold t-fg">{c.name}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 t-muted">{c.description}</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] t-muted" style={{ background: "var(--bg-subtle)" }}>
          {c.capability_class} · base half-life {Math.round(c.base_half_life_days)} days
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide t-subtle-fg">
            Approved rubric · {c.clauses.length} clauses
          </p>
          <div className="space-y-2">
            {byKind.map(([kind, list]) => (
              <div key={kind} className="flex flex-wrap items-center gap-1.5">
                <span className="w-36 shrink-0 text-[11px] capitalize t-muted">{kind.replace(/_/g, " ")}</span>
                {list.map((cl) => <RubricCitation key={cl.slug} slug={cl.slug} />)}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide t-subtle-fg">Required level · highest layer wins</p>
            <ul className="space-y-1.5">
              {c.requirements.map((r) => (
                <li key={`${r.source}-${r.scope}`} className="rounded-lg p-2 text-[11px] leading-4" style={{ background: "var(--bg-subtle)" }}>
                  <span className="flex flex-wrap justify-between gap-2">
                    <strong className="t-fg">{SOURCE_LABEL[r.source] ?? r.source}</strong>
                    <span className="t-fg">{formatLevel(r.required_level)} · {r.scope}</span>
                  </span>
                  <span className="mt-0.5 block t-subtle-fg">{r.rationale} — set by {r.set_by}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide t-subtle-fg">
              Coverage · {c.coverage.subject_count} learners · no average shown
            </p>
            <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--bg-subtle)" }}>
              {LEVELS.map((level, i) => {
                const n = c.coverage.distribution[level] ?? 0;
                return n > 0 ? (
                  <div key={level} title={`${formatLevel(level)}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: `hsl(${245 - i * 22} 70% ${45 + i * 8}%)` }} />
                ) : null;
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] t-subtle-fg">
              {LEVELS.map((level) => (
                <span key={level}>{formatLevel(level)} {c.coverage.distribution[level] ?? 0}</span>
              ))}
            </div>
            <p className="mt-2 text-[11px] t-muted">
              <strong className="t-fg">{Math.round(c.coverage.validated_coverage * 100)}%</strong> validated coverage ·{" "}
              {Math.round(c.coverage.nominal_coverage * 100)}% nominal · median{" "}
              {c.coverage.median_level ? formatLevel(c.coverage.median_level) : "n/a"}
              {c.coverage.critical_gap_count > 0 && ` · ${c.coverage.critical_gap_count} critical gap(s)`}
              {c.coverage.revalidation_due_count > 0 && ` · ${c.coverage.revalidation_due_count} revalidation due`}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
