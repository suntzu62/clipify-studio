import { Button } from '@/components/ui/button';
import { Crop } from 'lucide-react';

export const ReframePanel = ({ clip, onApply }: any) => {
  return (
    <div className="space-y-4">
      <h3 className="font-medium flex items-center gap-2">
        <Crop className="w-4 h-4" />
        Reframe 9:16
      </h3>
      <Button onClick={() => onApply?.({})}>
        Aplicar Reframe
      </Button>
    </div>
  );
};