import { Button } from '@/components/ui/button';
import { Volume2 } from 'lucide-react';

export const AudioMixer = ({ clip, onApply }: any) => {
  return (
    <div className="space-y-4">
      <h3 className="font-medium flex items-center gap-2">
        <Volume2 className="w-4 h-4" />
        Audio Mixer
      </h3>
      <Button onClick={() => onApply?.({})}>
        Aplicar Mixagem
      </Button>
    </div>
  );
};