"use client";

import { motion, useReducedMotion } from "framer-motion";

const NODES = [
  { label: "Capability", top: "18%", left: "12%" },
  { label: "Learning", top: "43%", left: "8%" },
  { label: "Evidence", top: "70%", left: "18%" },
  { label: "AI Review", top: "22%", left: "66%" },
  { label: "Validation", top: "52%", left: "74%" },
  { label: "Growth", top: "78%", left: "62%" },
];

const PARTICLES = [
  { top: "12%", left: "24%", delay: 0.1 },
  { top: "28%", left: "48%", delay: 0.3 },
  { top: "36%", left: "84%", delay: 0.5 },
  { top: "57%", left: "32%", delay: 0.7 },
  { top: "76%", left: "44%", delay: 0.9 },
  { top: "82%", left: "80%", delay: 1.1 },
];

export function BackgroundAnimation() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.05),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.18),transparent_34%)]" />

      <motion.div
        animate={
          shouldReduceMotion
            ? undefined
            : { y: [-10, 10, -10], x: [0, 8, 0], rotate: [-3, 2, -3] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[10%] top-[8%] h-56 w-56 rounded-full border border-white/10 bg-white/5 blur-3xl"
      />
      <motion.div
        animate={
          shouldReduceMotion ? undefined : { y: [12, -10, 12], rotate: [4, -2, 4] }
        }
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[10%] right-[4%] h-72 w-72 rounded-full border border-white/10 bg-[#6366F1]/12 blur-3xl"
      />

      <svg
        className="absolute inset-0 h-full w-full opacity-40"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="network-stroke" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(250,250,250,0.35)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0.7)" />
          </linearGradient>
        </defs>
        <path
          d="M10,24 C22,36 30,42 42,44 S65,26 78,28 88,44 92,52"
          stroke="url(#network-stroke)"
          strokeWidth="0.32"
          fill="none"
        />
        <path
          d="M18,72 C26,62 32,48 44,46 S64,54 72,62 84,78 92,78"
          stroke="url(#network-stroke)"
          strokeWidth="0.32"
          fill="none"
        />
        <path
          d="M22,18 C30,30 40,58 52,60 S70,46 78,32"
          stroke="url(#network-stroke)"
          strokeWidth="0.32"
          fill="none"
        />
      </svg>

      {NODES.map((node, index) => (
        <motion.div
          key={node.label}
          animate={
            shouldReduceMotion
              ? undefined
              : { y: [0, index % 2 === 0 ? -8 : 8, 0], scale: [1, 1.02, 1] }
          }
          transition={{
            duration: 7 + index,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute"
          style={{ top: node.top, left: node.left }}
        >
          <div className="rounded-full border border-white/14 bg-white/6 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/70 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {node.label}
          </div>
        </motion.div>
      ))}

      {PARTICLES.map((particle) => (
        <motion.span
          key={`${particle.top}-${particle.left}`}
          animate={
            shouldReduceMotion ? undefined : { opacity: [0.25, 0.8, 0.25], scale: [1, 1.4, 1] }
          }
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: particle.delay,
            ease: "easeInOut",
          }}
          className="absolute h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_16px_rgba(255,255,255,0.5)]"
          style={{ top: particle.top, left: particle.left }}
        />
      ))}
    </div>
  );
}
