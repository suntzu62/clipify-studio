import { cn } from '@/lib/utils';

interface SocialProofStripProps {
  className?: string;
}

export default function SocialProofStrip({ className }: SocialProofStripProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 items-center opacity-90">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 bg-white/20 rounded-md" aria-hidden />
        ))}
      </div>
      <p className="text-center text-sm text-white/80">+2.100 criadores testaram o Cortaí</p>
    </div>
  );
}
