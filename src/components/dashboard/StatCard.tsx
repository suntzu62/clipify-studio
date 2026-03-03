import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { TiltCard } from '@/components/landing';
import { AnimatedCounter } from './AnimatedCounter';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
    isPositive?: boolean;
  };
  variant?: 'default' | 'success' | 'warning' | 'info' | 'primary';
  className?: string;
}

export const StatCard = ({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: StatCardProps) => {
  const borderStyles = {
    default: 'border-white/10',
    success: 'border-success/25',
    warning: 'border-warning/25',
    info: 'border-info/25',
    primary: 'border-primary/25',
  };

  const overlayStyles = {
    default: 'from-white/[0.06] via-white/[0.02] to-transparent',
    success: 'from-success/20 via-success/5 to-transparent',
    warning: 'from-warning/18 via-warning/5 to-transparent',
    info: 'from-info/20 via-info/5 to-transparent',
    primary: 'from-primary/20 via-primary/5 to-transparent',
  };

  const iconStyles = {
    default: 'text-foreground/80',
    success: 'text-success',
    warning: 'text-warning',
    info: 'text-info',
    primary: 'text-primary',
  };

  return (
    <TiltCard tiltDegree={8} glare className={className}>
      <motion.div whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
        <Card
          className={cn(
            'relative overflow-hidden border glass-card glass-card-hover shadow-card backdrop-blur-xl transition-all duration-300',
            borderStyles[variant],
          )}
        >
          <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80', overlayStyles[variant])} />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {title}
                </p>
                <h3 className="mt-2 text-3xl font-display font-semibold text-foreground">
                  <AnimatedCounter value={value} />
                </h3>
                {description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                )}
                {trend && (
                  <div className="flex items-center gap-1 mt-2">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        trend.isPositive ? 'text-success' : 'text-destructive'
                      )}
                    >
                      {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {trend.label}
                    </span>
                  </div>
                )}
              </div>
              {Icon && (
                <motion.div
                  whileHover={{ rotate: [0, -15, 15, 0], scale: 1.15 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-xl border border-white/10 bg-background/40 p-3 backdrop-blur-sm"
                >
                  <Icon className={cn('w-6 h-6', iconStyles[variant])} />
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </TiltCard>
  );
};
