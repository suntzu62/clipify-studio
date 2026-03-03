import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FloatingOrbsProps {
  className?: string;
  variant?: 'default' | 'light';
}

const orbs = [
  { size: 320, color: 'hsl(262 100% 65% / 0.2)', x: [-40, 60], y: [-20, 40], duration: 20 },
  { size: 260, color: 'hsl(200 100% 60% / 0.15)', x: [60, -30], y: [30, -20], duration: 25 },
  { size: 200, color: 'hsl(280 100% 60% / 0.18)', x: [20, 80], y: [60, 10], duration: 18 },
  { size: 280, color: 'hsl(262 100% 65% / 0.12)', x: [70, 10], y: [-10, 50], duration: 22 },
  { size: 180, color: 'hsl(200 100% 60% / 0.14)', x: [-10, 50], y: [40, -10], duration: 16 },
];

const orbsLight = [
  { size: 300, color: 'rgba(255,255,255,0.08)', x: [-30, 50], y: [-10, 30], duration: 20 },
  { size: 240, color: 'rgba(255,255,255,0.06)', x: [50, -20], y: [20, -15], duration: 24 },
  { size: 200, color: 'rgba(255,255,255,0.07)', x: [10, 70], y: [50, 5], duration: 17 },
];

export function FloatingOrbs({ className, variant = 'default' }: FloatingOrbsProps) {
  const activeOrbs = variant === 'light' ? orbsLight : orbs;

  return (
    <div className={cn('absolute inset-0 overflow-hidden pointer-events-none z-0', className)}>
      {activeOrbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full will-change-transform"
          style={{
            width: orb.size,
            height: orb.size,
            background: orb.color,
            filter: 'blur(80px)',
            left: `${orb.x[0]}%`,
            top: `${orb.y[0]}%`,
          }}
          animate={{
            x: [0, (orb.x[1] - orb.x[0]) * 3, 0],
            y: [0, (orb.y[1] - orb.y[0]) * 3, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
