import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Clock, Info } from 'lucide-react';
import { TimeframeConfig } from '@/types/project-config';
import { cn } from '@/lib/utils';

interface TimeframeSelectorProps {
  timeframe: TimeframeConfig | undefined;
  onChange: (timeframe: TimeframeConfig | undefined) => void;
  videoDuration?: number; // Total video duration in seconds
}

export const TimeframeSelector = ({
  timeframe,
  onChange,
  videoDuration = 3600 // Default 1 hour if not known yet
}: TimeframeSelectorProps) => {
  const [useCustomTimeframe, setUseCustomTimeframe] = useState(!!timeframe);

  const handleToggle = (checked: boolean) => {
    setUseCustomTimeframe(checked);
    if (!checked) {
      onChange(undefined); // Process entire video
    } else {
      // Set default timeframe (first 10 minutes or entire video if shorter)
      const defaultEnd = Math.min(600, videoDuration);
      onChange({
        startTime: 0,
        endTime: defaultEnd,
        duration: defaultEnd,
      });
    }
  };

  const handleStartChange = (start: number) => {
    if (!timeframe) return;
    const newStart = Math.max(0, Math.min(start, timeframe.endTime - 30)); // Min 30s duration
    onChange({
      startTime: newStart,
      endTime: timeframe.endTime,
      duration: timeframe.endTime - newStart,
    });
  };

  const handleEndChange = (end: number) => {
    if (!timeframe) return;
    const newEnd = Math.max(timeframe.startTime + 30, Math.min(end, videoDuration)); // Min 30s duration
    onChange({
      startTime: timeframe.startTime,
      endTime: newEnd,
      duration: newEnd - timeframe.startTime,
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const parseTime = (timeString: string): number => {
    const parts = timeString.split(':');
    if (parts.length !== 2) return 0;
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return mins * 60 + secs;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Intervalo de Processamento
        </CardTitle>
        <CardDescription>
          Processe apenas uma parte específica do vídeo para economizar tempo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle Custom Timeframe */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="custom-timeframe" className="cursor-pointer">
              Usar Intervalo Personalizado
            </Label>
            <p className="text-sm text-muted-foreground">
              Processar apenas parte do vídeo
            </p>
          </div>
          <Switch
            id="custom-timeframe"
            checked={useCustomTimeframe}
            onCheckedChange={handleToggle}
          />
        </div>

        {/* Timeframe Settings */}
        {useCustomTimeframe && timeframe && (
          <div className="space-y-6 pt-4">
            {/* Visual Timeline */}
            <div className="relative h-12 bg-muted rounded-lg overflow-hidden">
              <div
                className="absolute h-full bg-primary/20 border-2 border-primary rounded"
                style={{
                  left: `${(timeframe.startTime / videoDuration) * 100}%`,
                  width: `${((timeframe.endTime - timeframe.startTime) / videoDuration) * 100}%`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {formatTime(0)} - {formatTime(videoDuration)}
                </span>
              </div>
            </div>

            {/* Start Time */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Início</Label>
                <Input
                  type="text"
                  value={formatTime(timeframe.startTime)}
                  onChange={(e) => handleStartChange(parseTime(e.target.value))}
                  className="w-24 text-center font-mono"
                  placeholder="MM:SS"
                />
              </div>
              <Slider
                value={[timeframe.startTime]}
                onValueChange={([value]) => handleStartChange(value)}
                min={0}
                max={videoDuration - 30}
                step={5}
                className="w-full"
              />
            </div>

            {/* End Time */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Fim</Label>
                <Input
                  type="text"
                  value={formatTime(timeframe.endTime)}
                  onChange={(e) => handleEndChange(parseTime(e.target.value))}
                  className="w-24 text-center font-mono"
                  placeholder="MM:SS"
                />
              </div>
              <Slider
                value={[timeframe.endTime]}
                onValueChange={([value]) => handleEndChange(value)}
                min={timeframe.startTime + 30}
                max={videoDuration}
                step={5}
                className="w-full"
              />
            </div>

            {/* Duration Display */}
            <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-sm font-medium">Duração a Processar</span>
              <span className="text-lg font-bold text-primary">
                {formatTime(timeframe.duration)}
              </span>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-lg">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs text-blue-900 dark:text-blue-100 font-medium">
                  Economize tempo de processamento
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Se você sabe que o conteúdo interessante está em uma parte específica do vídeo,
                  pode processar apenas esse intervalo. Ideal para vídeos longos!
                </p>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Atalhos Rápidos</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onChange({
                    startTime: 0,
                    endTime: Math.min(300, videoDuration),
                    duration: Math.min(300, videoDuration),
                  })}
                  className={cn(
                    'px-3 py-2 text-xs font-medium rounded border transition-colors',
                    'hover:bg-primary/10 hover:border-primary'
                  )}
                >
                  Primeiros 5min
                </button>
                <button
                  onClick={() => onChange({
                    startTime: 0,
                    endTime: Math.min(600, videoDuration),
                    duration: Math.min(600, videoDuration),
                  })}
                  className={cn(
                    'px-3 py-2 text-xs font-medium rounded border transition-colors',
                    'hover:bg-primary/10 hover:border-primary'
                  )}
                >
                  Primeiros 10min
                </button>
                <button
                  onClick={() => {
                    const midpoint = videoDuration / 2;
                    const halfRange = Math.min(300, videoDuration / 4);
                    onChange({
                      startTime: Math.max(0, midpoint - halfRange),
                      endTime: Math.min(videoDuration, midpoint + halfRange),
                      duration: Math.min(600, videoDuration / 2),
                    });
                  }}
                  className={cn(
                    'px-3 py-2 text-xs font-medium rounded border transition-colors',
                    'hover:bg-primary/10 hover:border-primary'
                  )}
                >
                  Meio do vídeo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full Video Info */}
        {!useCustomTimeframe && (
          <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-900 dark:text-green-100">
                O vídeo inteiro será processado ({formatTime(videoDuration)})
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
