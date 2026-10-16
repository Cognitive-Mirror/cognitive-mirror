"use client";

/** Small, shared markers: evidence artifacts and AI provenance. */

import { CircleAlert, ExternalLink, FileText, GitPullRequest, Link2, Sparkles, Ticket, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Artifact, ArtifactKind, ReviewProvenance } from "@/services/api";

const ARTIFACT_META: Record<ArtifactKind, { icon: LucideIcon; label: string }> = {
  github: { icon: GitPullRequest, label: "Code" },
  docs: { icon: FileText, label: "Doc" },
  ticket: { icon: Ticket, label: "Ticket" },
  video: { icon: Video, label: "Recording" },
  link: { icon: Link2, label: "Link" },
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
            className="tag tag-outline max-w-full hover:bg-[var(--surface-2)]"
          >
            <Icon />
            <span className="truncate">{compact ? meta.label : a.label || host(a.url)}</span>
            {!compact && <ExternalLink className="opacity-60" />}
          </a>
        );
      })}
    </div>
  );
}

export function ProvenanceBadge({ provenance, model }: { provenance: ReviewProvenance | "none"; model?: string }) {
  if (provenance === "verified_cache") {
    return (
      <span
        className="tag tag-primary"
        title="The live model was unavailable, so a pre-computed evaluation of this exact text was used. It passed the same server-side quote and citation checks as live output, and the audit record says it came from the cache."
      >
        <Sparkles /> Verified AI Evaluation <span className="font-normal opacity-75">· pre-computed</span>
      </span>
    );
  }
  if (provenance === "fallback" || provenance === "none") {
    return (
      <span
        className="tag"
        title="No model was reachable. A deterministic screen ran instead; the manager's judgement is the review."
      >
        <CircleAlert /> AI offline · manager review
      </span>
    );
  }
  return (
    <span className="tag tag-primary" title={model ? `Live model: ${model}` : "Live model"}>
      <Sparkles /> Live AI evaluation
    </span>
  );
}
