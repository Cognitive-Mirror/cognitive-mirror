"use client";

/**
 * Interactive exercise renderers, one per item type.
 *
 * Every drag interaction has a keyboard and click equivalent: drag-and-drop is
 * how the client's e-learns feel, but an exercise that only works with a mouse
 * excludes people and fails accessibility review.
 *
 *   categorize  drag a chip onto a bucket, OR select a chip then a bucket
 *   rank        drag a row, OR use the up / down buttons
 *   match       choose from a dropdown per left-hand item
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, X } from "lucide-react";
import { FillSamplePills, useDemoSamples } from "@/components/demo/FillSamplePills";
import { ProvenanceBadge } from "@/components/explain/Badges";
import { HighlightedText } from "@/components/explain/HighlightedText";
import type { Choice, ItemAnswer, ItemResult, PublicItem } from "@/services/api";

type Props = {
  item: PublicItem;
  value: ItemAnswer;
  onChange: (value: ItemAnswer) => void;
  /** After submission: the mark, and for e-learns the correct answer. */
  result?: ItemResult;
};

const chip = {
  border: "1px solid var(--line-strong)",
  background: "var(--bg)",
  color: "var(--ink)",
} as const;

function tone(selected: boolean, correct?: boolean | null) {
  if (correct === true) return { border: "1px solid var(--does)", background: "var(--does-soft)", color: "var(--ink)" };
  if (correct === false) return { border: "1px solid var(--risk)", background: "var(--risk-soft)", color: "var(--ink)" };
  if (selected) return { border: "1px solid var(--primary)", background: "var(--primary-tint)", color: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--primary)" };
  return chip;
}

// --- Choice -------------------------------------------------------------------

function SingleChoice({ item, value, onChange, result }: Props) {
  const chosen = value.choice as string | undefined;
  const correct = result?.reveal?.correct as string | undefined;
  return (
    <div role="radiogroup" aria-label={item.prompt} className="space-y-2">
      {(item.payload.options ?? []).map((o) => {
        const verdict = result?.reveal ? (o.id === correct ? true : o.id === chosen ? false : null) : null;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={chosen === o.id}
            disabled={!!result}
            onClick={() => onChange({ choice: o.id })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition disabled:cursor-default"
            style={tone(chosen === o.id, verdict)}
          >
            <span
              className="grid h-4 w-4 shrink-0 place-items-center"
              style={{ border: `2px solid ${chosen === o.id ? "var(--primary)" : "var(--ink-3)"}` }}
            >
              {chosen === o.id && <span className="h-2 w-2" style={{ background: "var(--primary)" }} />}
            </span>
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

function MultiChoice({ item, value, onChange, result }: Props) {
  const chosen = new Set((value.choices as string[] | undefined) ?? []);
  const correct = new Set((result?.reveal?.correct as string[] | undefined) ?? []);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ choices: [...next] });
  };
  return (
    <div className="space-y-2">
      <p className="meta">Select all that apply. Wrong selections cancel right ones.</p>
      {(item.payload.options ?? []).map((o) => {
        const on = chosen.has(o.id);
        const verdict = result?.reveal ? (correct.has(o.id) ? true : on ? false : null) : null;
        return (
          <label
            key={o.id}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition"
            style={tone(on, verdict)}
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={on}
              disabled={!!result}
              onChange={() => toggle(o.id)}
            />
            {o.text}
          </label>
        );
      })}
    </div>
  );
}

// --- Match --------------------------------------------------------------------

function Match({ item, value, onChange, result }: Props) {
  const pairs = (value.pairs as Record<string, string> | undefined) ?? {};
  const truth = result?.reveal?.pairs as Record<string, string> | undefined;
  const right = item.payload.right ?? [];
  const textOf = (id: string) => right.find((r) => r.id === id)?.text ?? "";
  return (
    <div className="space-y-3">
      {(item.payload.left ?? []).map((l) => {
        const verdict = truth ? pairs[l.id] === truth[l.id] : null;
        return (
          <div key={l.id} className="grid gap-2 p-3 sm:grid-cols-2 sm:items-center" style={tone(false, verdict)}>
            <span className="text-sm font-medium t-fg">{l.text}</span>
            <div>
              <select
                aria-label={`Match for: ${l.text}`}
                value={pairs[l.id] ?? ""}
                disabled={!!result}
                onChange={(e) => onChange({ pairs: { ...pairs, [l.id]: e.target.value } })}
                className="field py-2"
              >
                <option value="">Choose a match…</option>
                {right.map((r) => (
                  <option key={r.id} value={r.id}>{r.text}</option>
                ))}
              </select>
              {truth && verdict === false && (
                <p className="mt-1 text-xs ink-does">
                  Correct match: {textOf(truth[l.id])}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Rank ---------------------------------------------------------------------

function Rank({ item, value, onChange, result }: Props) {
  const items = item.payload.items ?? [];
  const order = (value.order as string[] | undefined) ?? items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));
  const truth = result?.reveal?.order as string[] | undefined;
  const [dragging, setDragging] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ order: next });
  };

  return (
    <div>
      <p className="meta mb-2">Drag to reorder, or use the arrows. Top is first.</p>
      <ol className="space-y-2">
        {order.map((id, idx) => {
          const verdict = truth ? truth[idx] === id : null;
          return (
            <li
              key={id}
              draggable={!result}
              onDragStart={() => setDragging(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging !== null) move(dragging, idx);
                setDragging(null);
              }}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
              style={{ ...tone(dragging === idx, verdict), opacity: dragging === idx ? 0.6 : 1 }}
            >
              <span className="w-5 text-center text-xs font-semibold t-subtle-fg">{idx + 1}</span>
              {!result && <GripVertical className="h-4 w-4 shrink-0 cursor-grab t-subtle-fg" aria-hidden />}
              <span className="flex-1 t-fg">{byId.get(id)?.text}</span>
              {!result && (
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move "${byId.get(id)?.text}" up`} onClick={() => move(idx, idx - 1)} disabled={idx === 0} className="p-1 disabled:opacity-30" style={chip}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label={`Move "${byId.get(id)?.text}" down`} onClick={() => move(idx, idx + 1)} disabled={idx === order.length - 1} className="p-1 disabled:opacity-30" style={chip}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {truth && truth.some((id, i) => order[i] !== id) && (
        <p className="mt-2 text-xs ink-does">
          Best order: {truth.map((id) => byId.get(id)?.text).join(" → ")}
        </p>
      )}
    </div>
  );
}

// --- Categorize (drag and drop) ------------------------------------------------

function Categorize({ item, value, onChange, result }: Props) {
  const placement = (value.placement as Record<string, string> | undefined) ?? {};
  const truth = result?.reveal?.placement as Record<string, string> | undefined;
  const [held, setHeld] = useState<string | null>(null);
  const items = item.payload.items ?? [];
  const buckets = item.payload.buckets ?? [];

  const place = (itemId: string, bucketId: string | null) => {
    const next = { ...placement };
    if (bucketId) next[itemId] = bucketId;
    else delete next[itemId];
    onChange({ placement: next });
    setHeld(null);
  };

  const renderChip = (c: Choice) => {
    const verdict = truth ? placement[c.id] === truth[c.id] : null;
    return (
      <button
        key={c.id}
        type="button"
        draggable={!result}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
        onClick={(e) => {
          // A chip sitting in a bucket must not also trigger the bucket's drop.
          e.stopPropagation();
          if (!result) setHeld(held === c.id ? null : c.id);
        }}
        aria-pressed={held === c.id}
        className="px-3 py-2 text-left text-xs leading-5 transition"
        style={tone(held === c.id, verdict)}
      >
        {c.text}
        {truth && verdict === false && (
          <span className="mt-1 block text-[11px] ink-does">
            → {buckets.find((b) => b.id === truth[c.id])?.label}
          </span>
        )}
      </button>
    );
  };

  const unplaced = items.filter((i) => !placement[i.id]);
  return (
    <div>
      {!result && (
        <p className="meta mb-2">
          Drag each card into a box — or tap a card, then tap a box.
        </p>
      )}
      {unplaced.length > 0 && (
        <div
          className="mb-3 flex min-h-12 flex-wrap gap-2 p-3"
          style={{ border: "1px dashed var(--line-strong)" }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => place(e.dataTransfer.getData("text/plain"), null)}
        >
          {unplaced.map(renderChip)}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {buckets.map((b) => (
          <div
            key={b.id}
            role="button"
            tabIndex={result ? -1 : 0}
            aria-label={`Place selected card in ${b.label}`}
            onClick={() => held && place(held, b.id)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && held) {
                e.preventDefault();
                place(held, b.id);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => place(e.dataTransfer.getData("text/plain"), b.id)}
            className="min-h-24 p-3 transition"
            style={{
              border: held ? "1px dashed var(--primary)" : "1px solid var(--line)",
              background: "var(--surface)",
            }}
          >
            <p className="caption mb-2">{b.label}</p>
            <div className="flex flex-wrap gap-2">
              {items.filter((i) => placement[i.id] === b.id).map(renderChip)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Text ---------------------------------------------------------------------

const inputStyle = { border: "1px solid var(--line-strong)", background: "var(--bg)", color: "var(--ink)" } as const;

function ShortAnswer({ item, value, onChange, result }: Props) {
  const accepted = result?.reveal?.accepted as string[] | undefined;
  return (
    <div>
      <input
        aria-label={item.prompt}
        value={(value.text as string) ?? ""}
        disabled={!!result}
        placeholder={item.payload.placeholder ?? "Type your answer"}
        onChange={(e) => onChange({ text: e.target.value })}
        className="field"
      />
      {accepted && result && (result.credit ?? 0) < 1 && (
        <p className="mt-2 text-xs ink-does">Answer: {accepted[0]}</p>
      )}
    </div>
  );
}

function FreeResponse({ item, value, onChange, result }: Props) {
  const text = (value.text as string) ?? "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const min = item.payload.min_words ?? 0;
  const keyPoints = result?.reveal?.key_points as string[] | undefined;
  const samples = useDemoSamples();
  const mine = samples?.free_response.filter((s) => s.question === item.prompt) ?? [];
  const detail = result?.ai_detail;
  const marked = detail && detail.quotes.length > 0 ? detail : null;
  return (
    <div>
      {item.payload.guidance && <p className="mb-2 text-xs t-muted">{item.payload.guidance}</p>}
      {!result && mine.length > 0 && (
        <div className="mb-2">
          <FillSamplePills
            available={mine.map((s) => s.strength)}
            onFill={(strength) => {
              const s = mine.find((x) => x.strength === strength);
              if (s) onChange({ text: s.answer });
            }}
          />
        </div>
      )}
      {marked ? (
        <div className="p-4" style={inputStyle}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ProvenanceBadge provenance={marked.provenance} />
          </div>
          <HighlightedText
            text={marked.answer_text || text}
            spans={marked.quotes.map((q) => ({
              start: q.start,
              end: q.end,
              label: `Key point ${q.key_point + 1}`,
              note: keyPoints?.[q.key_point] ?? "Credited against the marking guide.",
            }))}
          />
        </div>
      ) : (
      <textarea
        aria-label={item.prompt}
        rows={6}
        value={text}
        disabled={!!result}
        onChange={(e) => onChange({ text: e.target.value })}
        className="field reading p-4"
      />
      )}
      {!result && (
        <p className={`mt-1.5 text-xs num ${words < min ? "ink-pending" : "t-subtle-fg"}`}>
          {words} words{min ? ` · aim for at least ${min}` : ""}
        </p>
      )}
      {keyPoints && result?.credit !== null && (
        <div className="inset mt-4 px-4 py-3 text-sm leading-6">
          <p className="caption mb-1">What a strong answer covers</p>
          <ol className="list-decimal space-y-1 pl-5 t-muted marker:text-[var(--ink-3)]">
            {keyPoints.map((k) => <li key={k}>{k}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

// --- Dispatcher and result line --------------------------------------------------

const RENDERERS: Record<PublicItem["item_type"], (p: Props) => React.ReactElement> = {
  single_choice: SingleChoice,
  multi_choice: MultiChoice,
  match: Match,
  rank: Rank,
  categorize: Categorize,
  short_answer: ShortAnswer,
  free_response: FreeResponse,
};

export function ExerciseInput(props: Props) {
  const Renderer = RENDERERS[props.item.item_type];
  return <Renderer {...props} />;
}

export function ResultLine({ result }: { result: ItemResult }) {
  if (result.scored_by === "pending" || result.credit === null) {
    return (
      <p className="note note-pending mt-4">
        {result.feedback || "Being reviewed."} Not counted in your score until it is marked.
      </p>
    );
  }
  const full = result.credit >= 0.999;
  const none = result.credit <= 0.001;
  const Icon = full ? Check : X;
  return (
    <div className="mt-4 space-y-2">
      <p className={`note ${full ? "note-success" : none ? "note-error" : "note-pending"}`}>
        {(full || none) && <Icon />}
        <span>
          {!full && !none && <strong className="num font-semibold">{Math.round(result.credit * 100)}% · </strong>}
          {result.feedback}
          {result.scored_by === "ai" && <span className="opacity-75"> · marked by AI against the key points</span>}
          {result.scored_by === "human" && <span className="opacity-75"> · marked by a facilitator</span>}
        </span>
      </p>
      {result.explanation && <p className="text-sm leading-6 t-muted">{result.explanation}</p>}
    </div>
  );
}
