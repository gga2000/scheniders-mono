"use client";

import { useEffect, useRef } from "react";
import { useSpring, useMotionValue, motion } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  formatFn?: (n: number) => string;
}

const defaultFormat = (n: number) =>
  new Intl.NumberFormat("en-IQ").format(Math.round(n));

export function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 1.2,
  className = "",
  formatFn = defaultFormat,
}: AnimatedCounterProps) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = `${prefix}${formatFn(latest)}${suffix}`;
      }
    });
    return unsubscribe;
  }, [springValue, prefix, suffix, formatFn]);

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {prefix}{formatFn(value)}{suffix}
    </motion.span>
  );
}
