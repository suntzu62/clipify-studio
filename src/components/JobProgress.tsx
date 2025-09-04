import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface JobProgressProps {
  value: number;
  label?: string;
  className?: string;
  showPercentage?: boolean;
}

export const JobProgress = ({ 
  value, 
  label, 
  className, 
  showPercentage = true 
}: JobProgressProps) => {
  return (
    <div className={cn("space-y-2", className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between text-sm">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showPercentage && <span className="text-foreground font-medium">{value}%</span>}
        </div>
      )}
      <Progress value={value} className="h-2" />
    </div>
  );
};