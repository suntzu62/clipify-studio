import { useEffect, useRef } from 'react';
import { useSpring, useTransform, motion, useInView } from 'framer-motion';

interface AnimatedCounterProps {
  value: string | number;
  className?: string;
  duration?: number;
}

export const AnimatedCounter = ({ value, className, duration = 1.5 }: AnimatedCounterProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  // Parse numeric value and suffix
  const strValue = String(value);
  const match = strValue.match(/^([+-]?\d+(?:\.\d+)?)\s*(.*)$/);

  if (!match) {
    // Non-numeric value, just render it
    return <span className={className}>{value}</span>;
  }

  const numericValue = parseFloat(match[1]);
  const suffix = match[2] || '';

  const spring = useSpring(0, {
    stiffness: 50,
    damping: 20,
    duration: duration,
  });

  const display = useTransform(spring, (latest) => {
    if (Number.isInteger(numericValue)) {
      return `${Math.round(latest)}${suffix}`;
    }
    return `${latest.toFixed(1)}${suffix}`;
  });

  useEffect(() => {
    if (isInView) {
      spring.set(numericValue);
    }
  }, [isInView, numericValue, spring]);

  return <motion.span ref={ref} className={className}>{display}</motion.span>;
};
