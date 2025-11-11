import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

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
  const variantStyles = {
    default: 'bg-gradient-card border-gray-200',
    success: 'bg-gradient-success border-success/20',
    warning: 'bg-gradient-warning border-warning/20',
    info: 'bg-gradient-info border-info/20',
    primary: 'bg-gradient-primary border-primary/20',
  };

  const iconStyles = {
    default: 'text-gray-600',
    success: 'text-success-foreground',
    warning: 'text-warning-foreground',
    info: 'text-info-foreground',
    primary: 'text-primary-foreground',
  };

  const textStyles = {
    default: 'text-foreground',
    success: 'text-success-foreground',
    warning: 'text-warning-foreground',
    info: 'text-info-foreground',
    primary: 'text-primary-foreground',
  };

  return (
    <Card className={cn(variantStyles[variant], 'border-2 shadow-lg', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className={cn('text-sm font-medium', textStyles[variant], 'opacity-90')}>
              {title}
            </p>
            <h3 className={cn('text-3xl font-bold mt-2', textStyles[variant])}>
              {value}
            </h3>
            {description && (
              <p className={cn('text-sm mt-1', textStyles[variant], 'opacity-75')}>
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
                <span className={cn('text-xs', textStyles[variant], 'opacity-75')}>
                  {trend.label}
                </span>
              </div>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                'p-3 rounded-lg',
                variant === 'default' ? 'bg-primary/10' : 'bg-white/20'
              )}
            >
              <Icon className={cn('w-6 h-6', iconStyles[variant])} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
