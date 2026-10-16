"use client";

/** Small, shared badges: evidence artifacts and AI provenance. */

import { CircleAlert, ExternalLink, FileText, GitPullRequest, Link2, Sparkles, Ticket, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Artifact, ArtifactKind, ReviewProvenance } from "@/services/api";

const ARTIFACT_META: Record<ArtifactKind, { icon: LucideIcon; label: string; tint: string }> = {
  github: { icon: GitPullRequest, label: "Code", tint: "rgba(139,92,246,.14)" },
  docs: { icon: FileText, label: "Doc", tint: "rgba(59,130,246,.14)" },
  ticket: { icon: Ticket, label: "Ticket", tint: "rgba(245,158,11,.14)" },
  video: { icon: Video, label: "Video", tint: "rgba(236,72,153,.14)" },
  link: { icon: Link2, label: "Link", tint: "rgba(100,116,139,.14)" },
};

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ArtifactBadges({ artifacts, compact = false }: { artifacts: Artifact[]; compact?: boolean }) {
  if (!artifacts?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {artifacts.map((a) => {
        const meta = ARTIFACT_META[a.kind] ?? ARTIFACT_META.link;
        const Icon = meta.icon;
        return (
          <a
            key={a.url}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`${a.label || meta.label} · ${host(a.url)}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium t-fg transition hover:opacity-80"
            style={{ background: meta.tint, border: "1px solid var(--border)" }}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{compact ? meta.label : a.label || host(a.url)}</span>
            {!compact && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />}
          </a>
        );
      })}
    </div>
  );
}

export function ProvenanceBadge({ provenance, model }: { provenance: ReviewProvenance | "none"; model?: string }) {
  if (provenance === "verified_cache") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200"
          style={{ background: "rgba(99,102,241,.16)" }}
        >
          <Sparkles className="h-3 w-3" /> Verified AI Evaluation
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] t-subtle-fg"
          style={{ background: "var(--bg-subtle)" }}
          title="The live model was unavailable, so a pre-computed evaluation of this exact text was used. It passed the same server-side quote and citation checks as live output, and the audit record says it came from the cache."
        >
          pre-computed
        </span>
      </span>
    );
  }
  if (provenance === "fallback" || provenance === "none") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] t-muted"
        style={{ background: "var(--bg-subtle)" }}
        title="No model was reachable. A deterministic screen ran instead; the manager's judgement is the review."
      >
        <CircleAlert className="h-3 w-3" /> AI offline · manager review
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200"
      style={{ background: "rgba(99,102,241,.16)" }}
      title={model ? `Live model: ${model}` : "Live model"}
    >
      <Sparkles className="h-3 w-3" /> Live AI evaluation
    </span>
  );
}
