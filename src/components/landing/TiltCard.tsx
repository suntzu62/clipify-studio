import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  tiltDegree?: number;
  glare?: boolean;
}

export function TiltCard({ children, className, tiltDegree = 12, glare = true }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const rawRotateX = useTransform(mouseY, [0, 1], [tiltDegree, -tiltDegree]);
  const rawRotateY = useTransform(mouseX, [0, 1], [-tiltDegree, tiltDegree]);
  const rotateX = useSpring(rawRotateX, { stiffness: 300, damping: 30 });
  const rotateY = useSpring(rawRotateY, { stiffness: 300, damping: 30 });

  const glareX = useTransform(mouseX, [0, 1], [0, 100]);
  const glareY = useTransform(mouseY, [0, 1], [0, 100]);
  const glareOpacity = useTransform(
    mouseX,
    [0, 0.5, 1],
    [0.12, 0.04, 0.12]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

  return (
    <div ref={ref} style={{ perspective: 1000 }} className={cn('relative', className)}>
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-full"
      >
        {children}
        {glare && (
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none z-10"
            style={{
              background: useTransform(
                [glareX, glareY],
                ([x, y]) =>
                  `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.15), transparent 60%)`
              ),
              opacity: glareOpacity,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
