"use client";

/**
 * Presenter toolbar: one-click persona switching, demo reset, AI status.
 *
 * Renders nothing unless the backend reports demo mode (development only), so
 * it can stay mounted in the root layout. `DemoRoot` re-keys the page on every
 * persona switch and reset, which makes every screen refetch its data without
 * each one listening for demo events itself.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleAlert,
  Cpu,
  Loader2,
  LogOut,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { ROLE_HOME, type RoleId } from "@/lib/auth";
import {
  activePersona,
  clearPersona,
  type AIStatus,
  type DemoPersona,
  getAIStatus,
  getPersonas,
  PERSONA_EVENT,
  type PersonasResponse,
  RESET_EVENT,
  resetDemo,
  setPersona,
} from "@/services/demo";

const COLLAPSE_KEY = "cm.demoToolbar.collapsed";

/** Remounts the page whenever the acting persona changes or the demo resets. */
export function DemoRoot({ children }: { children: React.ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const bump = () => setEpoch((n) => n + 1);
    window.addEventListener(PERSONA_EVENT, bump);
    window.addEventListener(RESET_EVENT, bump);
    return () => {
      window.removeEventListener(PERSONA_EVENT, bump);
      window.removeEventListener(RESET_EVENT, bump);
    };
  }, []);
  return (
    <>
      <Fragment key={epoch}>{children}</Fragment>
      <DemoToolbar />
    </>
  );
}

type Toast = { tone: "ok" | "warn"; text: string };

// The four the brief puts one click away; the other two sit in a second row.
const PRIMARY: { key: string; label: string; hint?: string }[] = [
  { key: "priya", label: "Learner · Priya" },
  { key: "arjun", label: "Learner · Arjun", hint: "Knows / Does gap" },
  { key: "dev", label: "Manager" },
  { key: "sarah", label: "Admin" },
];

function readCollapsed(): boolean {
  // A remembered choice wins; otherwise start collapsed on phone-width screens,
  // where the open panel would cover the page.
  try {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored !== null) return stored === "1";
  } catch {
    /* fall through to the viewport default */
  }
  return window.innerWidth < 640;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

export function DemoToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<PersonasResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [ai, setAi] = useState<AIStatus | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [probing, setProbing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const refresh = useCallback(() => {
    getPersonas()
      .then((body) => {
        setData(body);
        setOffline(false);
      })
      .catch((err: unknown) => {
        // A 404 means demo mode is off: stay invisible. Anything else is the
        // presenter's backend not running, which they need to know.
        setOffline(err instanceof TypeError);
        setData(null);
      });
  }, []);

  useEffect(() => {
    // Client-only state, read after hydration so server and client render alike.
    const t = setTimeout(() => {
      setActive(activePersona());
      setCollapsed(readCollapsed());
    }, 0);
    refresh();
    getAIStatus().then(setAi).catch(() => setAi(null));
    const onPersona = () => setActive(activePersona());
    window.addEventListener(PERSONA_EVENT, onPersona);
    return () => {
      clearTimeout(t);
      window.removeEventListener(PERSONA_EVENT, onPersona);
    };
  }, [refresh]);

  // Keep the active persona's summary current as the presenter moves around.
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  function toggle() {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* not remembered */
      }
      return !c;
    });
  }

  function choose(p: DemoPersona) {
    setPersona(p.email);
    setActive(p.email);
    // Same area (e.g. Priya -> Arjun on the journey): stay put; the page
    // remounts and refetches as the new persona. Otherwise go to their home.
    const home = ROLE_HOME[p.role as RoleId];
    if (!pathname.startsWith(home)) router.push(home);
  }

  async function reset() {
    setResetting(true);
    try {
      const r = await resetDemo();
      setToast({
        tone: "ok",
        text: `Demo data reset in ${Math.round(r.elapsed_ms)} ms · ${r.evidence} evidence items, ${r.pending_validation} awaiting validation.`,
      });
      refresh();
    } catch (err) {
      setToast({ tone: "warn", text: err instanceof Error ? err.message : "Reset failed." });
    } finally {
      setResetting(false);
    }
  }

  async function probe() {
    setProbing(true);
    try {
      const s = await getAIStatus(true);
      setAi(s);
      const p = s.probe;
      setToast(
        p?.ok
          ? { tone: "ok", text: `Live model reachable (${s.vendor}, ${Math.round(p.latency_ms ?? 0)} ms).` }
          : {
              tone: "warn",
              text: `Live model ${p?.error_kind.replace(/_/g, " ") || "unavailable"}. Canonical samples will use the verified cache.`,
            },
      );
    } catch {
      setToast({ tone: "warn", text: "Could not reach the AI status endpoint." });
    } finally {
      setProbing(false);
    }
  }

  if (!data && !offline) return null;

  const personas = data?.personas ?? [];
  const current = personas.find((p) => p.email === active) ?? null;
  const byKey = (k: string) => personas.find((p) => p.key === k);
  const secondary = personas.filter((p) => !PRIMARY.some((x) => x.key === p.key));

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(380px,calc(100vw-2rem))] flex-col items-end gap-2">
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`pointer-events-auto flex w-full items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs leading-5 shadow-lg ${
              toast.tone === "ok" ? "text-emerald-50" : "text-amber-50"
            }`}
            style={{ background: toast.tone === "ok" ? "rgba(5,150,105,.95)" : "rgba(180,83,9,.95)" }}
          >
            {toast.tone === "ok" ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="pointer-events-auto w-full overflow-hidden rounded-2xl shadow-2xl backdrop-blur-xl"
        style={{ border: "1px solid var(--border-md)", background: "color-mix(in srgb, var(--bg-card) 92%, transparent)" }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
        >
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-500 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[.16em] t-subtle-fg">
              Demo mode{data ? ` · ${data.org_name}` : ""}
            </span>
            <span className="block truncate text-xs font-semibold t-fg">
              {offline
                ? "Backend unreachable — start it with npm run dev"
                : current
                  ? `${current.display_name} · ${current.role}`
                  : "No persona — choose one"}
            </span>
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4 t-muted" /> : <ChevronDown className="h-4 w-4 t-muted" />}
        </button>

        {!collapsed && data && (
          <div className="space-y-3 px-3.5 pb-3.5">
            {current?.summary && (
              <div className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: "var(--bg-subtle)" }}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
                  {initials(current.display_name)}
                </span>
                <div className="min-w-0 text-[11px] leading-4">
                  <p className="truncate font-semibold t-fg">{current.archetype}</p>
                  <p className="t-muted">
                    {current.summary.capability_name}: <strong className="t-fg capitalize">{current.summary.attained_level}</strong>
                    {" · conf "}
                    <strong className="t-fg">{current.summary.state_confidence.toFixed(2)}</strong>
                    {" · knows "}
                    <strong className="t-fg">{pct(current.summary.knowledge_mastery)}</strong>
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Act as">
              {PRIMARY.map(({ key, label, hint }) => {
                const p = byKey(key);
                if (!p) return null;
                const on = p.email === active;
                return (
                  <button
                    key={key}
                    onClick={() => choose(p)}
                    aria-pressed={on}
                    title={p.headline}
                    className="rounded-xl px-2.5 py-2 text-left text-[11px] font-semibold transition"
                    style={
                      on
                        ? { background: "var(--accent)", color: "white" }
                        : { background: "var(--bg-subtle)", color: "var(--fg)", border: "1px solid var(--border)" }
                    }
                  >
                    {label}
                    {hint && <span className={`block text-[10px] font-normal ${on ? "text-indigo-100" : "t-subtle-fg"}`}>{hint}</span>}
                  </button>
                );
              })}
            </div>
            {secondary.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {secondary.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => choose(p)}
                    aria-pressed={p.email === active}
                    title={p.headline}
                    className="rounded-full px-2.5 py-1 text-[10px] font-medium transition"
                    style={
                      p.email === active
                        ? { background: "var(--accent)", color: "white" }
                        : { background: "var(--bg-subtle)", color: "var(--fg-muted)" }
                    }
                  >
                    {p.display_name.split(" ")[0]} · {p.archetype}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void reset()}
                disabled={resetting}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {resetting ? "Resetting…" : "Reset demo data"}
              </button>
              <button
                onClick={() => void probe()}
                disabled={probing}
                title="Check the live model with a 1-token call"
                className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-medium transition disabled:opacity-60"
                style={{ background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
              >
                {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                {ai?.key_configured ? ai.vendor : "AI: cache"}
              </button>
              {current && (
                <button
                  onClick={() => {
                    clearPersona();
                    setActive(null);
                    router.push("/");
                  }}
                  title="Stop acting as a persona"
                  aria-label="Stop acting as a persona"
                  className="grid h-8 w-8 place-items-center rounded-xl transition"
                  style={{ background: "var(--bg-subtle)" }}
                >
                  <LogOut className="h-3.5 w-3.5 t-muted" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
