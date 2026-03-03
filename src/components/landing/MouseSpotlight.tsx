import { motion, useMotionValue } from 'framer-motion';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

interface MouseSpotlightProps {
  children: React.ReactNode;
  className?: string;
  size?: number;
  opacity?: number;
}

export function MouseSpotlight({
  children,
  className,
  size = 600,
  opacity = 0.07,
}: MouseSpotlightProps) {
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      x.set(e.clientX - rect.left);
      y.set(e.clientY - rect.top);
    },
    [x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(-1000);
    y.set(-1000);
  }, [x, y]);

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className="absolute pointer-events-none z-0 rounded-full"
        style={{
          width: size,
          height: size,
          left: x,
          top: y,
          x: '-50%',
          y: '-50%',
          background: `radial-gradient(circle, hsl(262 100% 65% / ${opacity}), transparent 60%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
