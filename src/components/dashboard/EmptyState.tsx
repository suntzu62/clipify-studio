import { motion } from 'framer-motion';
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
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          {illustration}
        </motion.div>
      ) : Icon ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="mb-6 p-6 rounded-full bg-gradient-subtle animate-float animate-glow-pulse"
        >
          <Icon className="w-16 h-16 text-gray-400" />
        </motion.div>
      ) : null}

      {/* Content */}
      <div className="max-w-md space-y-3" style={{ perspective: 600 }}>
        <motion.h3
          initial={{ opacity: 0, y: 15, rotateX: 5 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-xl font-semibold text-foreground"
        >
          {title}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 15, rotateX: 5 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="text-sm text-muted-foreground leading-relaxed"
        >
          {description}
        </motion.p>
      </div>

      {/* Actions */}
      {(action || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="flex items-center gap-3 mt-8"
        >
          {action && (
            <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={action.onClick}
                variant={action.variant || 'default'}
                size="lg"
                className="shadow-lg"
              >
                {action.label}
              </Button>
            </motion.div>
          )}
          {secondaryAction && (
            <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={secondaryAction.onClick}
                variant="outline"
                size="lg"
              >
                {secondaryAction.label}
              </Button>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
};
