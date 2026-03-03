import { cn } from '@/lib/utils';
import { Platform, PLATFORM_CONFIGS } from '@/types/platform-safe-zones';

interface PlatformSelectorProps {
  selected: Platform;
  onChange: (platform: Platform) => void;
  showDescription?: boolean;
}

export const PlatformSelector = ({ selected, onChange, showDescription = false }: PlatformSelectorProps) => {
  const platforms = Object.entries(PLATFORM_CONFIGS) as [Platform, typeof PLATFORM_CONFIGS[Platform]][];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {platforms.map(([key, config]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'px-3 py-2 rounded-lg border-2 transition-all text-sm flex items-center gap-1.5',
              selected === key
                ? 'border-primary bg-primary/20 text-white'
                : 'border-white/10 hover:border-white/30 bg-white/5 text-white/70'
            )}
          >
            <span>{config.emoji}</span>
            <span>{config.name}</span>
          </button>
        ))}
      </div>
      {showDescription && PLATFORM_CONFIGS[selected] && (
        <p className="text-xs text-muted-foreground">
          {PLATFORM_CONFIGS[selected].description}
        </p>
      )}
    </div>
  );
};

interface SafeZoneOverlayProps {
  platform: Platform;
  visible?: boolean;
}

export const SafeZoneOverlay = ({ platform, visible = true }: SafeZoneOverlayProps) => {
  if (!visible) return null;

  const config = PLATFORM_CONFIGS[platform];
  if (!config) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div
        className="absolute left-0 right-0 top-0 bg-red-500/10 border-b border-red-500/30"
        style={{ height: config.safeZone.top }}
      />
      <div
        className="absolute left-0 right-0 bottom-0 bg-red-500/10 border-t border-red-500/30"
        style={{ height: config.safeZone.bottom }}
      />
    </div>
  );
};
