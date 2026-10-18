"use client";

/**
 * Motion primitives for the infographics.
 *
 * Every chart plays once, when it first scrolls into view: the reading of the
 * data is the animation (a bar drawing to its value, a level filling rung by
 * rung, a number counting to itself). Nothing loops. With reduced motion the
 * final state renders immediately and only colour transitions remain.
 */

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** True once the element has been on screen. Starts true without IntersectionObserver. */
export function useReveal<T extends Element>(margin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, margin]);

  return { ref, shown, reduce: !!reduce };
}

/** A number that counts up to its value the first time it is seen. */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 0.9,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const { ref, shown, reduce } = useReveal<HTMLSpanElement>();
  const [counted, setCounted] = useState(0);

  useEffect(() => {
    if (!shown || reduce) return;
    const controls = animate(0, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => setCounted(v),
    });
    return () => controls.stop();
  }, [shown, value, duration, reduce]);

  return (
    <span ref={ref} className={`num ${className ?? ""}`} aria-label={`${prefix}${value.toFixed(decimals)}${suffix}`}>
      <span aria-hidden>
        {prefix}
        {(reduce ? value : counted).toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}
