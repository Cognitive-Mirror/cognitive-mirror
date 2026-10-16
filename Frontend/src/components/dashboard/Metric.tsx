/**
 * A ruled line of figures. Replaces a grid of metric tiles: the numbers read
 * as one sentence about the state, not as four separate trophies.
 */

type Tone = "knows" | "does" | "pending" | "risk";

export function StatLine({
  items,
  className = "",
}: {
  items: { label: string; value: string; tone?: Tone }[];
  className?: string;
}) {
  return (
    <dl className={`grid grid-cols-2 rule rule-b sm:grid-cols-4 ${className}`}>
      {items.map((item, i) => (
        <div
          key={item.label}
          className="py-4 pr-4 sm:pl-5 sm:first:pl-0"
          style={i > 0 ? { borderLeft: "1px solid var(--line)" } : undefined}
        >
          <dt className="meta">{item.label}</dt>
          <dd className={`num mt-1 text-[1.375rem] font-medium tracking-[-0.01em] ${item.tone ? `ink-${item.tone}` : "t-fg"}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
