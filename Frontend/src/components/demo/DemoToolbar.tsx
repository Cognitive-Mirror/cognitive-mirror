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

  // The sign-in page carries its own quick access; the panel would cover it.
  if (pathname === "/") return null;
  if (!data && !offline) return null;

  const personas = data?.personas ?? [];
  const current = personas.find((p) => p.email === active) ?? null;
  const byKey = (k: string) => personas.find((p) => p.key === k);
  const secondary = personas.filter((p) => !PRIMARY.some((x) => x.key === p.key));

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(360px,calc(100vw-2rem))] flex-col items-end gap-2">
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="snackbar pointer-events-auto w-full"
          >
            {toast.tone === "ok" ? (
              <CircleCheck className="h-4 w-4 shrink-0" style={{ color: "var(--does)" }} />
            ) : (
              <CircleAlert className="h-4 w-4 shrink-0" style={{ color: "var(--pending)" }} />
            )}
            <span className="leading-5">{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto w-full overflow-hidden" style={{ background: "var(--bg)", boxShadow: "var(--shadow-2)" }}>
        <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface)]">
          <Sparkles className="h-4 w-4 shrink-0 ink-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium t-fg">
              {offline
                ? "Backend unreachable"
                : current
                  ? `${current.display_name} · ${current.role}`
                  : "Demo mode · choose a persona"}
            </span>
            <span className="meta block truncate">
              {offline ? "Start it with npm run dev" : data?.org_name}
            </span>
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4 t-muted" /> : <ChevronDown className="h-4 w-4 t-muted" />}
        </button>

        {!collapsed && data && (
          <div className="space-y-4 px-4 pb-4 pt-1">
            {current?.summary && (
              <div className="rule pt-3 text-[13px] leading-5">
                <p className="font-medium t-fg">{current.archetype}</p>
                <p className="num t-muted">
                  {current.summary.capability_name}:{" "}
                  <span className="ink-does font-medium capitalize">{current.summary.attained_level}</span>
                  {" · confidence "}
                  <span className="font-medium t-fg">{current.summary.state_confidence.toFixed(2)}</span>
                  {" · knows "}
                  <span className="ink-knows font-medium">{pct(current.summary.knowledge_mastery)}</span>
                </p>
              </div>
            )}

            <div>
              <p className="caption mb-2">Act as</p>
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
                      className="px-3 py-2 text-left text-[13px] font-medium transition"
                      style={
                        on
                          ? { background: "var(--primary-soft)", color: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--primary)" }
                          : { background: "var(--bg)", color: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--line-strong)" }
                      }
                    >
                      {label}
                      {hint && <span className="meta block font-normal">{hint}</span>}
                    </button>
                  );
                })}
              </div>
              {secondary.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {secondary.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => choose(p)}
                      aria-pressed={p.email === active}
                      title={p.headline}
                      className={`text-[12px] font-medium hover:underline ${p.email === active ? "t-fg underline" : "ink-primary"}`}
                    >
                      {p.display_name.split(" ")[0]} · {p.archetype}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 rule pt-3">
              <button onClick={() => void reset()} disabled={resetting} className="btn btn-primary btn-sm flex-1">
                {resetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                {resetting ? "Resetting…" : "Reset demo data"}
              </button>
              <button
                onClick={() => void probe()}
                disabled={probing}
                title="Check the live model with a 1-token call"
                className="btn btn-neutral btn-sm"
              >
                {probing ? <Loader2 className="animate-spin" /> : <Cpu />}
                {ai?.key_configured ? ai.vendor : "AI check"}
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
                  className="btn btn-icon h-[1.875rem] w-[1.875rem]"
                >
                  <LogOut />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
