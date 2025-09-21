import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';

export const BrandingPanel = ({ clip, onApply }: any) => {
  return (
    <div className="space-y-4">
      <h3 className="font-medium flex items-center gap-2">
        <Star className="w-4 h-4" />
        Branding
      </h3>
      <Button onClick={() => onApply?.({})}>
        Aplicar Logo
      </Button>
    </div>
  );
};