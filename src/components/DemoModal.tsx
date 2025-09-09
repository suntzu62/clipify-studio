import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ReactPlayer from 'react-player';

interface DemoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseDemo: () => void;
}

const DEMO_VIDEO = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

export default function DemoModal({ open, onOpenChange, onUseDemo }: DemoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Demo de 60s</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md overflow-hidden aspect-video bg-black">
            <ReactPlayer
              url={DEMO_VIDEO}
              width="100%"
              height="100%"
              playing
              loop
              muted
              controls
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { onUseDemo(); onOpenChange(false); }}>
              Usar o mesmo vídeo de demonstração
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

