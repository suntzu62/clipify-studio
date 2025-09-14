import { cn } from '@/lib/utils';

interface SocialProofStripProps {
  className?: string;
}

export default function SocialProofStrip({ className }: SocialProofStripProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 items-center opacity-80">
        {Array.from({ length: 6 }).map((_, i) => (
          <div 
            key={i} 
            className="h-6 bg-white/15 rounded-md animate-pulse" 
            style={{ animationDelay: `${i * 0.1}s` }}
            aria-hidden 
          />
        ))}
      </div>
      <p className="text-center text-sm text-white/90 font-medium">
        <span className="text-green-300 font-semibold">+2.100</span> criadores testaram o Cortaí
      </p>
    </div>
  );
}
