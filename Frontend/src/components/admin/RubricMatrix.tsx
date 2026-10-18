"use client";

/**
 * Governance view: the approved rubric, grouped by capability, with the D6
 * requirement layers and tenant-wide coverage.
 *
 * Coverage is a distribution, never an average (D2): levels are ordinal.
 */

import { ErrorNote, Loading } from "@/components/AppShell";
import { RubricCitation } from "@/components/RubricCitation";
import { StatLine } from "@/components/dashboard/Metric";
import { LEVEL_LABEL, LEVELS } from "@/components/explain/Mirror";
import { type Unit, LevelUnits } from "@/components/viz/charts";
import { CountUp } from "@/components/viz/motion";
import { useResource } from "@/lib/useResource";
import { getGovernanceMatrix, type MatrixCapability } from "@/services/api";

const SOURCE_LABEL: Record<string, string> = {
  spine_default: "Default",
  tenant_role: "Role override",
  program_target: "Programme target",
};

const SOURCE_OWNER: Record<string, string> = {
  spine_default: "Impact Capability Spine",
  tenant_role: "Client",
  program_target: "Programme owner",
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
    <div>
      <StatLine
        items={[
          { label: "Approved clauses", value: data.approved_clause_count },
          { label: "Capabilities", value: data.capabilities.length },
          { label: "Unvalidated confidence ceiling", value: data.unvalidated_ceiling, decimals: 2 },
          { label: "Scoring model", value: `v${data.scoring_model_version}` },
        ]}
      />
      <p className="meta mt-3">
        {Object.entries(data.clauses_by_kind).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(" · ")}.
        Required level resolves {data.resolution_order.map((s) => SOURCE_LABEL[s] ?? s).join(" → ")}, highest layer wins.
      </p>

      <div className="mt-6">
        {data.capabilities.map((c) => <CapabilityBlock key={c.id} capability={c} floor={data.coverage_confidence_floor} />)}
      </div>

      {data.shared_clauses.length > 0 && (
        <section className="rule py-10">
          <h3 className="display display-sm">Shared KPI clauses</h3>
          <p className="meta mt-1">Association only, never causation. Cited across capabilities.</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {data.shared_clauses.map((cl) => <RubricCitation key={cl.slug} slug={cl.slug} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function CapabilityBlock({ capability: c, floor }: { capability: MatrixCapability; floor: number }) {
  const byKind = KIND_ORDER.map((k) => [k, c.clauses.filter((cl) => cl.kind === k)] as const).filter(([, v]) => v.length);
  const winner = c.requirements[c.requirements.length - 1];
  return (
    <section className="rule py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="display display-md">{c.name}</h3>
        <p className="meta">
          {c.capability_class} · evidence half-life {Math.round(c.base_half_life_days)} days
          {c.linked_kpi_ids.length > 0 && ` · supports ${c.linked_kpi_ids.join(", ")}`}
        </p>
      </div>
      <p className="lede mt-2 text-[0.9375rem]">{c.description}</p>

      <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="caption mb-3">Approved rubric · {c.clauses.length} clauses</p>
          <dl className="rows rule-b">
            {byKind.map(([kind, list]) => (
              <div key={kind} className="grid gap-2 py-3 sm:grid-cols-[10rem_1fr]">
                <dt className="text-[13px] capitalize t-muted">{kind.replace(/_/g, " ")}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {list.map((cl) => <RubricCitation key={cl.slug} slug={cl.slug} />)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-8">
          <div>
            <p className="caption mb-3">Required level</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Applies to</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {c.requirements.map((r) => (
                  <tr key={`${r.source}-${r.scope}`} title={r.rationale}>
                    <td>
                      <span className="font-medium">{SOURCE_LABEL[r.source] ?? r.source}</span>
                      <span className="meta block">{SOURCE_OWNER[r.source]} · {r.set_by}</span>
                    </td>
                    <td className="t-muted">{r.scope}</td>
                    <td>
                      <span className={r === winner ? "font-semibold" : ""}>{LEVEL_LABEL[r.required_level]}</span>
                      {r === winner && c.requirements.length > 1 && <span className="meta block">wins for its scope</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="caption mb-3">Coverage · one square per learner · no average shown</p>
            <LevelUnits
              units={LEVELS.flatMap((level, i) =>
                Array.from({ length: c.coverage.distribution[level] ?? 0 }, (_, k) => ({
                  key: `${level}-${k}`,
                  label: "Learner",
                  level: i,
                  tone: (winner && i >= LEVELS.indexOf(winner.required_level as (typeof LEVELS)[number]) ? "met" : "below") as Unit["tone"],
                })),
              )}
              required={winner ? LEVELS.indexOf(winner.required_level as (typeof LEVELS)[number]) : null}
              legend={false}
            />
            {winner && (
              <p className="meta mt-2">Shaded columns meet the required level, {LEVEL_LABEL[winner.required_level]}. Green squares are there; grey squares are not yet.</p>
            )}
            <p className="mt-4 text-sm t-fg">
              <CountUp value={Math.round(c.coverage.validated_coverage * 100)} suffix="%" className="text-lg font-medium" />{" "}
              <span className="t-muted">
                validated coverage (at required, manager-validated, confidence ≥ {floor.toFixed(2)}) ·{" "}
                {Math.round(c.coverage.nominal_coverage * 100)}% nominal · median{" "}
                {c.coverage.median_level ? LEVEL_LABEL[c.coverage.median_level] : "n/a"}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.coverage.critical_gap_count > 0 && <span className="tag tag-risk">{c.coverage.critical_gap_count} critical gap{c.coverage.critical_gap_count === 1 ? "" : "s"}</span>}
              {c.coverage.revalidation_due_count > 0 && <span className="tag tag-risk">{c.coverage.revalidation_due_count} revalidation due</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
