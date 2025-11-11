import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  illustration?: React.ReactNode;
  className?: string;
}

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  illustration,
  className,
}: EmptyStateProps) => {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {/* Illustration or Icon */}
      {illustration ? (
        <div className="mb-6">{illustration}</div>
      ) : Icon ? (
        <div className="mb-6 p-6 rounded-full bg-gradient-subtle">
          <Icon className="w-16 h-16 text-gray-400" />
        </div>
      ) : null}

      {/* Content */}
      <div className="max-w-md space-y-3">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-8">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || 'default'}
              size="lg"
              className="shadow-lg"
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant="outline"
              size="lg"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
