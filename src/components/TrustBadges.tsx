import { Lock, ShieldCheck, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TrustBadgesProps {
  className?: string;
}

export default function TrustBadges({ className }: TrustBadgesProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 text-xs text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Sem cartão de crédito</span>
      <span>•</span>
      <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Privado e seguro</span>
      <span>•</span>
      <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cancele quando quiser</span>
      <span>•</span>
      <Badge variant="secondary" className="h-5 rounded-sm px-2">Stripe • Supabase</Badge>
    </div>
  );
}

