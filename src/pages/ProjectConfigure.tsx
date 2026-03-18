import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { saveUserJob } from '@/lib/storage';
import type { Job } from '@/lib/jobs-api';
import { getBackendUrl } from '@/lib/backend-url';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  ChevronDown,
  Zap,
  Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DEFAULT_PLATFORM_REMIX,
  type PlatformRemix,
  type ProjectConfig,
  type RemixPlatform,
  type SubtitlePreferences,
} from '@/types/project-config';
import { cn } from '@/lib/utils';

// ── Preset definitions ──────────────────────────────────────────
interface StylePreset {
  id: string;
  label: string;
  description: string;
  gradient: string;
  accentColor: string;
  sampleWords: string[];
  values: Partial<SubtitlePreferences>;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'viral',
    label: 'Viral Boost',
    description: 'Alto impacto, texto grande e bold',
    gradient: 'from-amber-500/20 via-orange-500/10 to-red-500/20',
    accentColor: '#F59E0B',
    sampleWords: ['Momento', 'viral', 'detectado!'],
    values: {
      font: 'Montserrat',
      fontSize: 36,
      bold: true,
      outline: true,
      outlineWidth: 3,
      shadow: true,
      backgroundOpacity: 0.82,
      format: 'multi-line',
      position: 'bottom',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
    },
  },
  {
    id: 'clean',
    label: 'Clean Glass',
    description: 'Minimalista, elegante e legivel',
    gradient: 'from-sky-500/20 via-cyan-500/10 to-blue-500/20',
    accentColor: '#38BDF8',
    sampleWords: ['Estilo', 'clean', 'e moderno'],
    values: {
      font: 'Inter',
      fontSize: 30,
      bold: true,
      outline: false,
      shadow: true,
      backgroundOpacity: 0.58,
      format: 'single-line',
      position: 'bottom',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
    },
  },
  {
    id: 'cinema',
    label: 'Cinema Neo',
    description: 'Drama cinematografico com profundidade',
    gradient: 'from-purple-500/20 via-violet-500/10 to-fuchsia-500/20',
    accentColor: '#A855F7',
    sampleWords: ['Cinema', 'em cada', 'frame'],
    values: {
      font: 'Poppins',
      fontSize: 34,
      bold: true,
      italic: true,
      outline: true,
      outlineColor: '#080808',
      shadow: true,
      shadowColor: '#111111',
      backgroundOpacity: 0.72,
      format: 'progressive',
      position: 'center',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
    },
  },
  {
    id: 'neon',
    label: 'Neon Pop',
    description: 'Cores vibrantes estilo TikTok',
    gradient: 'from-pink-500/20 via-rose-500/10 to-red-500/20',
    accentColor: '#EC4899',
    sampleWords: ['Neon', 'vibes', 'only!'],
    values: {
      font: 'Montserrat',
      fontSize: 34,
      bold: true,
      outline: true,
      outlineWidth: 2,
      outlineColor: '#EC4899',
      shadow: true,
      shadowColor: '#EC4899',
      backgroundOpacity: 0,
      format: 'karaoke',
      position: 'center',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
    },
  },
  {
    id: 'podcast',
    label: 'Podcast Pro',
    description: 'Perfeito para podcasts e entrevistas',
    gradient: 'from-emerald-500/20 via-green-500/10 to-teal-500/20',
    accentColor: '#10B981',
    sampleWords: ['Insight', 'poderoso', 'aqui'],
    values: {
      font: 'Inter',
      fontSize: 30,
      bold: true,
      outline: false,
      shadow: true,
      backgroundOpacity: 0.9,
      format: 'multi-line',
      position: 'bottom',
      fontColor: '#FFFFFF',
      backgroundColor: '#1a1a2e',
    },
  },
  {
    id: 'bold',
    label: 'Bold Impact',
    description: 'Maximo destaque, estilo Hormozi',
    gradient: 'from-red-500/20 via-orange-500/10 to-yellow-500/20',
    accentColor: '#EF4444',
    sampleWords: ['ATENCAO', 'pra isso', 'agora!'],
    values: {
      font: 'Montserrat',
      fontSize: 38,
      bold: true,
      outline: true,
      outlineWidth: 4,
      shadow: true,
      backgroundOpacity: 0,
      format: 'karaoke',
      position: 'center',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
    },
  },
];

const PLATFORM_OPTIONS: Array<{
  value: RemixPlatform;
  label: string;
  description: string;
  recommendedAspectRatio: '9:16' | '4:5';
}> = [
  {
    value: 'youtube_shorts',
    label: 'YouTube Shorts',
    description: 'Mais contexto, clareza e payoff cedo.',
    recommendedAspectRatio: '9:16',
  },
  {
    value: 'instagram_reels',
    label: 'Instagram Reels',
    description: 'Mais clean, premium e compartilhavel.',
    recommendedAspectRatio: '9:16',
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    description: 'Mais agressivo, direto e scroll-stopping.',
    recommendedAspectRatio: '9:16',
  },
  {
    value: 'linkedin',
    label: 'LinkedIn',
    description: 'Mais autoridade, insight e tom profissional.',
    recommendedAspectRatio: '4:5',
  },
];

const REMIX_GOALS: Array<{ value: PlatformRemix['goal']; label: string; description: string }> = [
  { value: 'viral', label: 'Viralizar', description: 'Gancho forte e retenção alta.' },
  { value: 'conversion', label: 'Converter', description: 'Levar para clique, lead ou venda.' },
  { value: 'authority', label: 'Autoridade', description: 'Posicionar expertise e credibilidade.' },
  { value: 'engagement', label: 'Engajar', description: 'Gerar comentário, share e save.' },
];

const HOOK_STYLE_OPTIONS: Array<{ value: PlatformRemix['hookStyle']; label: string }> = [
  { value: 'bold', label: 'Bold' },
  { value: 'curiosity', label: 'Curiosidade' },
  { value: 'teaching', label: 'Ensino' },
  { value: 'story', label: 'Story' },
];

const CAPTION_STYLE_OPTIONS: Array<{ value: PlatformRemix['captionStyle']; label: string }> = [
  { value: 'punchy', label: 'Punchy' },
  { value: 'conversational', label: 'Conversa' },
  { value: 'expert', label: 'Expert' },
];

// ── Helpers ──────────────────────────────────────────────────────
const clampOpacity = (opacity: number) => Math.max(0, Math.min(1, opacity));

const hexToRgba = (hex: string, opacity: number): string => {
  const safe = hex.replace('#', '').trim();
  const normalized =
    safe.length === 3
      ? safe
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : safe;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(0, 0, 0, ${clampOpacity(opacity)})`;
  }
  const int = parseInt(normalized, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${clampOpacity(opacity)})`;
};

const extractYoutubeId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
    const byQuery = parsed.searchParams.get('v');
    if (byQuery) return byQuery;
    const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts?.[1]) return shorts[1];
    const embed = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embed?.[1]) return embed[1];
    return null;
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ── Animated word component for the phone preview ───────────────
function AnimatedWords({
  words,
  accentColor,
  style,
}: {
  words: string[];
  accentColor: string;
  style: CSSProperties;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % words.length);
    }, 900);
    return () => clearInterval(interval);
  }, [words.length]);

  return (
    <span style={style}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          animate={{
            color: i === activeIndex ? accentColor : (style.color as string) || '#fff',
            scale: i === activeIndex ? 1.08 : 1,
          }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            display: 'inline-block',
            marginRight: i < words.length - 1 ? '0.25em' : 0,
          }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────
export default function ProjectConfigure() {
  const { tempId } = useParams<{ tempId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('viral');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '4:5' | '16:9'>('9:16');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateSubtitlePreference = useCallback(
    <K extends keyof SubtitlePreferences>(key: K, value: SubtitlePreferences[K]) => {
      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subtitlePreferences: { ...prev.subtitlePreferences, [key]: value },
        };
      });
    },
    [],
  );

  const updatePlatformRemix = useCallback(
    <K extends keyof PlatformRemix>(key: K, value: PlatformRemix[K]) => {
      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          platformRemix: { ...prev.platformRemix, [key]: value },
        };
      });
    },
    [],
  );

  const handlePresetChange = useCallback(
    (presetId: string) => {
      setSelectedPreset(presetId);
      const preset = STYLE_PRESETS.find((p) => p.id === presetId);
      if (preset && config) {
        setConfig({
          ...config,
          subtitlePreferences: { ...config.subtitlePreferences, ...preset.values },
        });
      }
    },
    [config],
  );

  // Load temp config
  useEffect(() => {
    if (!tempId || !user) return;

    const loadTempConfig = async () => {
      try {
        const baseUrl = getBackendUrl();
        const apiKey = import.meta.env.VITE_API_KEY || '';
        const response = await fetchWithTimeout(`${baseUrl}/jobs/temp/${tempId}`, {
          headers: { 'X-API-Key': apiKey },
        }, 20000);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Configuração não encontrada ou expirada');
        }
        const data = await response.json();
        if (!data.clipSettings || !data.subtitlePreferences) {
          throw new Error('Dados de configuração incompletos');
        }
        setConfig({
          ...data,
          platformRemix: data.platformRemix || DEFAULT_PLATFORM_REMIX,
        });
        // Apply "Viral Boost" as default
        const viral = STYLE_PRESETS[0];
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                subtitlePreferences: { ...prev.subtitlePreferences, ...viral.values },
                platformRemix: prev.platformRemix || DEFAULT_PLATFORM_REMIX,
              }
            : prev,
        );
      } catch (error: unknown) {
        console.error('Failed to load temp config:', error);
        toast({
          title: 'Erro ao carregar configuração',
          description: getErrorMessage(
            error,
            'A configuração pode ter expirado (1 hora). Tente criar um novo projeto.',
          ),
          variant: 'destructive',
        });
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadTempConfig();
  }, [tempId, user, navigate, toast]);

  // Start processing
  const handleStartProcessing = async () => {
    if (!config || !tempId) return;
    setProcessing(true);
    try {
      const baseUrl = getBackendUrl();
      const apiKey = import.meta.env.VITE_API_KEY || '';
      const requestBody = {
        clipSettings: config.clipSettings,
        subtitlePreferences: config.subtitlePreferences,
        platformRemix: config.platformRemix,
        timeframe: config.timeframe,
        genre: config.genre,
        specificMoments: config.specificMoments,
        aspectRatio,
      };
      const response = await fetchWithTimeout(`${baseUrl}/jobs/temp/${tempId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(requestBody),
      }, 30000);
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || 'Falha ao iniciar processamento');
      }
      const { jobId } = responseData;
      if (!jobId) throw new Error('JobId não foi retornado pelo servidor');

      if (user?.id && config) {
        const job: Job = {
          id: jobId,
          youtubeUrl: config.youtubeUrl,
          status: 'queued',
          progress: 0,
          createdAt: new Date().toISOString(),
          neededMinutes: 10,
        };
        saveUserJob(user.id, job);
      }

      toast({
        title: 'Processamento iniciado!',
        description: 'Seu video esta sendo processado com as configuracoes escolhidas.',
      });
      navigate(`/projects/${jobId}`);
    } catch (error: unknown) {
      console.error('Error starting processing:', error);
      const description = error instanceof DOMException && error.name === 'AbortError'
        ? 'Timeout da requisicao. O backend demorou para responder. Tente novamente.'
        : getErrorMessage(error, 'Erro desconhecido ao criar o job');

      toast({
        title: 'Erro ao iniciar processamento',
        description,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080c] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative mx-auto mb-6 h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 blur-xl opacity-50 animate-pulse" />
            <Loader2 className="relative w-16 h-16 animate-spin text-white/80" />
          </div>
          <p className="text-white/40 text-sm">Preparando seu estudio...</p>
        </motion.div>
      </div>
    );
  }

  if (!config) return null;

  const youtubeId = extractYoutubeId(config.youtubeUrl);
  const activePreset = STYLE_PRESETS.find((p) => p.id === selectedPreset) || STYLE_PRESETS[0];
  const platformRemix = config.platformRemix || DEFAULT_PLATFORM_REMIX;

  const handlePrimaryPlatformChange = (platform: RemixPlatform) => {
    const recommendedAspectRatio = PLATFORM_OPTIONS.find((option) => option.value === platform)?.recommendedAspectRatio || '9:16';
    const dedupedTargets = Array.from(new Set([platform, ...platformRemix.targetPlatforms]));
    setAspectRatio(recommendedAspectRatio);
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        platformRemix: {
          ...prev.platformRemix,
          primaryPlatform: platform,
          targetPlatforms: dedupedTargets,
        },
      };
    });
  };

  const toggleTargetPlatform = (platform: RemixPlatform) => {
    setConfig((prev) => {
      if (!prev) return prev;

      const currentTargets = prev.platformRemix.targetPlatforms;
      const hasPlatform = currentTargets.includes(platform);
      let nextTargets = hasPlatform
        ? currentTargets.filter((item) => item !== platform)
        : [...currentTargets, platform];

      if (nextTargets.length === 0) {
        nextTargets = [prev.platformRemix.primaryPlatform];
      }

      if (!nextTargets.includes(prev.platformRemix.primaryPlatform)) {
        nextTargets = [prev.platformRemix.primaryPlatform, ...nextTargets];
      }

      return {
        ...prev,
        platformRemix: {
          ...prev.platformRemix,
          targetPlatforms: nextTargets,
        },
      };
    });
  };

  // Build preview styles
  const sp = config.subtitlePreferences;
  const previewSubtitleStyle: CSSProperties = {
    fontFamily: sp.font,
    color: sp.fontColor,
    backgroundColor: hexToRgba(sp.backgroundColor, sp.backgroundOpacity),
    fontSize: `${Math.max(10, Math.min(16, Math.round(sp.fontSize * 0.38)))}px`,
    fontWeight: sp.bold ? 700 : 400,
    fontStyle: sp.italic ? 'italic' : 'normal',
    borderRadius: '6px',
    padding: '4px 8px',
    letterSpacing: '0.02em',
    lineHeight: '1.4',
    textAlign: 'center' as const,
    display: 'inline-block',
    maxWidth: '100%',
    wordBreak: 'break-word' as const,
    textShadow: sp.shadow ? `0 2px 8px ${sp.shadowColor}` : 'none',
    ...(sp.outline
      ? {
          WebkitTextStroke: `${Math.max(0.5, sp.outlineWidth * 0.3)}px ${sp.outlineColor}`,
        }
      : {}),
  };

  return (
    <div className="min-h-screen bg-[#08080c] text-white/90 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="relative z-30 border-b border-white/[0.04]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="gap-2 text-white/40 hover:bg-white/[0.04] hover:text-white/80 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar
          </Button>

          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-3"
          >
            <span className="text-[13px] text-white/30 hidden sm:inline">
              Estilo das legendas
            </span>
            <div className="h-4 w-px bg-white/[0.08] hidden sm:block" />
            <Button
              onClick={handleStartProcessing}
              disabled={processing}
              className="h-9 px-5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[13px] font-semibold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:brightness-110 transition-all disabled:opacity-40 disabled:shadow-none"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Gerar clipes agora
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </header>

      {/* ── Main content: split layout ────────────────────── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr] gap-8 lg:gap-12">
          {/* ── LEFT: Video preview ──────────────────────── */}
          <div className="flex flex-col items-center lg:sticky lg:top-20 lg:self-start">
            {/* Ambient glow */}
            <motion.div
              key={activePreset.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className={cn(
                'absolute -z-10 w-[340px] h-[400px] rounded-full blur-[120px] opacity-30',
                `bg-gradient-to-br ${activePreset.gradient}`,
              )}
            />

            {/* Aspect ratio selector */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex items-center gap-1.5 mb-4 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            >
              {(
                [
                  { value: '9:16', label: '9:16', w: 9, h: 14 },
                  { value: '1:1', label: '1:1', w: 12, h: 12 },
                  { value: '4:5', label: '4:5', w: 10, h: 12 },
                  { value: '16:9', label: '16:9', w: 14, h: 9 },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAspectRatio(opt.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all',
                    aspectRatio === opt.value
                      ? 'bg-white/[0.1] text-white/90'
                      : 'text-white/35 hover:text-white/60',
                  )}
                >
                  {/* Mini aspect ratio icon */}
                  <div
                    className={cn(
                      'border rounded-[2px] transition-colors',
                      aspectRatio === opt.value ? 'border-white/50' : 'border-white/20',
                    )}
                    style={{ width: opt.w, height: opt.h }}
                  />
                  {opt.label}
                </button>
              ))}
            </motion.div>

            {/* Video preview frame */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative w-full flex justify-center"
            >
              <motion.div
                layout
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black shadow-2xl shadow-black/60"
                style={{
                  aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : aspectRatio === '4:5' ? '4/5' : '16/9',
                  width: aspectRatio === '9:16' ? '260px' : aspectRatio === '1:1' ? '320px' : aspectRatio === '4:5' ? '300px' : '380px',
                  maxWidth: '100%',
                }}
              >
                {/* Video thumbnail */}
                <div className="absolute inset-0 z-0">
                  {youtubeId ? (
                    <img
                      src={`https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src.includes('maxresdefault')) {
                          img.src = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
                        }
                      }}
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-b from-[#1a1a2e] via-[#16162a] to-[#0a0a14]" />
                  )}
                  {/* Dark overlay for subtitle readability */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/50" />
                </div>

                {/* LOW-RES PREVIEW badge */}
                <div className="absolute top-3 left-3 z-20 px-2 py-0.5 rounded bg-black/60 text-[9px] font-medium text-white/50 tracking-wider uppercase">
                  Preview
                </div>

                {/* Aspect ratio badge */}
                <div className="absolute top-3 right-3 z-20 px-2 py-0.5 rounded bg-black/60 text-[9px] font-medium text-white/50 tracking-wider">
                  {aspectRatio}
                </div>

                {/* Subtitle preview overlay */}
                <div
                  className="absolute left-4 right-4 z-10 flex justify-center"
                  style={{
                    ...(sp.position === 'top' && { top: '12%' }),
                    ...(sp.position === 'center' && { top: '50%', transform: 'translateY(-50%)' }),
                    ...((sp.position === 'bottom' || !sp.position) && { bottom: '8%' }),
                  }}
                >
                  <AnimatedWords
                    words={activePreset.sampleWords}
                    accentColor={activePreset.accentColor}
                    style={previewSubtitleStyle}
                  />
                </div>
              </motion.div>
            </motion.div>

            {/* Video info */}
            {youtubeId && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-4 text-center text-[11px] text-white/20 max-w-[300px] leading-relaxed"
              >
                Ao continuar, voce confirma que este e seu conteudo original.
              </motion.p>
            )}
          </div>

          {/* ── RIGHT: Controls ───────────────────────────── */}
          <div className="space-y-8 pb-12">
            {/* Section: Choose style */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-violet-400">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[15px] font-semibold text-white/90">Escolha o estilo</h2>
                <span className="text-[11px] text-white/25 ml-auto">1 clique e pronto</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {STYLE_PRESETS.map((preset, i) => (
                  <motion.button
                    key={preset.id}
                    type="button"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                    onClick={() => handlePresetChange(preset.id)}
                    className={cn(
                      'group relative flex flex-col rounded-2xl border-2 p-4 text-left transition-all duration-300',
                      selectedPreset === preset.id
                        ? 'border-white/20 bg-white/[0.06] shadow-lg'
                        : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.04]',
                    )}
                  >
                    {/* Selected indicator */}
                    <AnimatePresence>
                      {selectedPreset === preset.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-white"
                        >
                          <Check className="h-3 w-3 text-[#08080c]" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Mini preview bar */}
                    <div
                      className={cn(
                        'mb-3 flex h-10 items-center justify-center rounded-lg bg-gradient-to-br',
                        preset.gradient,
                      )}
                    >
                      <span
                        className="text-[11px] font-bold tracking-wide"
                        style={{
                          fontFamily: preset.values.font,
                          color: '#fff',
                          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                        }}
                      >
                        {preset.sampleWords.join(' ')}
                      </span>
                    </div>

                    <span className="text-[13px] font-semibold text-white/90">{preset.label}</span>
                    <span className="mt-0.5 text-[11px] text-white/35 leading-tight">
                      {preset.description}
                    </span>

                    {/* Accent dot */}
                    <div
                      className="mt-2.5 h-1 w-6 rounded-full opacity-60"
                      style={{ backgroundColor: preset.accentColor }}
                    />
                  </motion.button>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.22 }}
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-500/20 text-fuchsia-400">
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-white/90">Remix por plataforma</h2>
                  <p className="text-[11px] text-white/30">
                    Ajusta hook, copy e selecao dos clipes para cada canal.
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-white/80">Ativar remix automatico</p>
                    <p className="text-[11px] text-white/30">
                      Otimiza a analise para plataforma, meta e estilo de hook.
                    </p>
                  </div>
                  <Switch
                    checked={platformRemix.enabled}
                    onCheckedChange={(checked) => updatePlatformRemix('enabled', checked)}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {platformRemix.enabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div>
                        <p className="mb-3 text-[12px] text-white/45">Plataforma principal</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {PLATFORM_OPTIONS.map((platform) => (
                            <button
                              key={platform.value}
                              type="button"
                              onClick={() => handlePrimaryPlatformChange(platform.value)}
                              className={cn(
                                'rounded-xl border p-3 text-left transition-all',
                                platformRemix.primaryPlatform === platform.value
                                  ? 'border-fuchsia-400/40 bg-fuchsia-500/10'
                                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[13px] font-medium text-white/85">{platform.label}</span>
                                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/45">
                                  {platform.recommendedAspectRatio}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                                {platform.description}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-3 text-[12px] text-white/45">Meta do remix</p>
                        <div className="grid grid-cols-2 gap-3">
                          {REMIX_GOALS.map((goal) => (
                            <button
                              key={goal.value}
                              type="button"
                              onClick={() => updatePlatformRemix('goal', goal.value)}
                              className={cn(
                                'rounded-xl border p-3 text-left transition-all',
                                platformRemix.goal === goal.value
                                  ? 'border-violet-400/40 bg-violet-500/10'
                                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
                              )}
                            >
                              <p className="text-[13px] font-medium text-white/85">{goal.label}</p>
                              <p className="mt-1 text-[11px] leading-relaxed text-white/35">{goal.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                          <p className="mb-2 text-[12px] text-white/45">Hook principal</p>
                          <QuickSelect
                            label="Estilo"
                            value={platformRemix.hookStyle}
                            onChange={(value) => updatePlatformRemix('hookStyle', value as PlatformRemix['hookStyle'])}
                            options={HOOK_STYLE_OPTIONS}
                          />
                        </div>
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                          <p className="mb-2 text-[12px] text-white/45">Estilo da copy</p>
                          <QuickSelect
                            label="Copy"
                            value={platformRemix.captionStyle}
                            onChange={(value) => updatePlatformRemix('captionStyle', value as PlatformRemix['captionStyle'])}
                            options={CAPTION_STYLE_OPTIONS}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[12px] font-medium text-white/75">Gerar hooks alternativos</p>
                            <p className="text-[11px] text-white/30">
                              Faz a IA favorecer aberturas mais reaproveitaveis e testaveis.
                            </p>
                          </div>
                          <Switch
                            checked={platformRemix.generateAltHooks}
                            onCheckedChange={(checked) => updatePlatformRemix('generateAltHooks', checked)}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="mb-3 text-[12px] text-white/45">Tambem quero reaproveitar em</p>
                        <div className="flex flex-wrap gap-2">
                          {PLATFORM_OPTIONS.map((platform) => {
                            const selected = platformRemix.targetPlatforms.includes(platform.value);
                            return (
                              <button
                                key={platform.value}
                                type="button"
                                onClick={() => toggleTargetPlatform(platform.value)}
                                className={cn(
                                  'rounded-full border px-3 py-1.5 text-[11px] transition-all',
                                  selected
                                    ? 'border-white/20 bg-white/[0.08] text-white/85'
                                    : 'border-white/[0.06] bg-white/[0.02] text-white/35 hover:text-white/65',
                                )}
                              >
                                {platform.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>

            {/* Section: Quick controls row */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <QuickSelect
                  label="Formato"
                  value={sp.format}
                  onChange={(v) => updateSubtitlePreference('format', v as SubtitlePreferences['format'])}
                  options={[
                    { value: 'single-line', label: 'Linha unica' },
                    { value: 'multi-line', label: 'Multiplas linhas' },
                    { value: 'karaoke', label: 'Karaoke' },
                    { value: 'progressive', label: 'Progressivo' },
                  ]}
                />
                <div className="h-6 w-px bg-white/[0.06] hidden sm:block" />
                <QuickSelect
                  label="Posicao"
                  value={sp.position}
                  onChange={(v) => updateSubtitlePreference('position', v as SubtitlePreferences['position'])}
                  options={[
                    { value: 'top', label: 'Topo' },
                    { value: 'center', label: 'Centro' },
                    { value: 'bottom', label: 'Inferior' },
                  ]}
                />
                <div className="h-6 w-px bg-white/[0.06] hidden sm:block" />
                <QuickSelect
                  label="Fonte"
                  value={sp.font}
                  onChange={(v) => updateSubtitlePreference('font', v as SubtitlePreferences['font'])}
                  options={[
                    { value: 'Inter', label: 'Inter' },
                    { value: 'Montserrat', label: 'Montserrat' },
                    { value: 'Poppins', label: 'Poppins' },
                    { value: 'Roboto', label: 'Roboto' },
                    { value: 'Arial', label: 'Arial' },
                  ]}
                />
              </div>
            </motion.section>

            {/* Section: Advanced toggle */}
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06]">
                  <motion.div
                    animate={{ rotate: showAdvanced ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-white/50" />
                  </motion.div>
                </div>
                <span className="text-[13px] font-medium text-white/60">
                  Personalizar detalhes
                </span>
                <span className="ml-auto text-[11px] text-white/20">
                  Tamanho, cores, contorno, sombra
                </span>
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                      {/* Font size */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[12px] text-white/50">Tamanho da fonte</Label>
                          <span className="text-[12px] tabular-nums text-white/70">{sp.fontSize}px</span>
                        </div>
                        <Slider
                          value={[sp.fontSize]}
                          onValueChange={([v]) => updateSubtitlePreference('fontSize', v)}
                          min={16}
                          max={48}
                          step={1}
                        />
                      </div>

                      {/* Background opacity */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[12px] text-white/50">Opacidade do fundo</Label>
                          <span className="text-[12px] tabular-nums text-white/70">
                            {Math.round(sp.backgroundOpacity * 100)}%
                          </span>
                        </div>
                        <Slider
                          value={[sp.backgroundOpacity * 100]}
                          onValueChange={([v]) => updateSubtitlePreference('backgroundOpacity', v / 100)}
                          min={0}
                          max={100}
                          step={5}
                        />
                      </div>

                      {/* Colors row */}
                      <div className="grid grid-cols-2 gap-5">
                        <ColorPicker
                          label="Cor do texto"
                          value={sp.fontColor}
                          onChange={(v) => updateSubtitlePreference('fontColor', v)}
                        />
                        <ColorPicker
                          label="Cor de fundo"
                          value={sp.backgroundColor}
                          onChange={(v) => updateSubtitlePreference('backgroundColor', v)}
                        />
                      </div>

                      {/* Outline */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[12px] text-white/50">Contorno</Label>
                          <Switch
                            checked={sp.outline}
                            onCheckedChange={(v) => updateSubtitlePreference('outline', v)}
                          />
                        </div>
                        {sp.outline && (
                          <div className="grid grid-cols-2 gap-4 pl-1">
                            <ColorPicker
                              label="Cor"
                              value={sp.outlineColor}
                              onChange={(v) => updateSubtitlePreference('outlineColor', v)}
                            />
                            <div className="space-y-2">
                              <Label className="text-[11px] text-white/40">
                                Largura: {sp.outlineWidth}px
                              </Label>
                              <Slider
                                value={[sp.outlineWidth]}
                                onValueChange={([v]) => updateSubtitlePreference('outlineWidth', v)}
                                min={1}
                                max={5}
                                step={1}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Shadow */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[12px] text-white/50">Sombra</Label>
                          <Switch
                            checked={sp.shadow}
                            onCheckedChange={(v) => updateSubtitlePreference('shadow', v)}
                          />
                        </div>
                        {sp.shadow && (
                          <div className="pl-1">
                            <ColorPicker
                              label="Cor da sombra"
                              value={sp.shadowColor}
                              onChange={(v) => updateSubtitlePreference('shadowColor', v)}
                            />
                          </div>
                        )}
                      </div>

                      {/* Style toggles */}
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={sp.bold}
                            onCheckedChange={(v) => updateSubtitlePreference('bold', v)}
                          />
                          <span className="text-[12px] text-white/50">Bold</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={sp.italic}
                            onCheckedChange={(v) => updateSubtitlePreference('italic', v)}
                          />
                          <span className="text-[12px] text-white/50">Italic</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            {/* ── Bottom CTA (mobile-friendly) ────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="pt-2"
            >
              <Button
                size="lg"
                onClick={handleStartProcessing}
                disabled={processing}
                className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-white text-[15px] font-bold shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:brightness-110 transition-all disabled:opacity-40 disabled:shadow-none"
              >
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-5 w-5" />
                    Gerar clipes agora
                  </>
                )}
              </Button>
              <p className="mt-3 text-center text-[11px] text-white/20">
                Os clipes serao gerados com IA em poucos minutos
              </p>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────

function QuickSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-white/35">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent p-0 text-[12px] font-medium text-white/80 hover:text-white shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] text-white/40">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-lg border-white/[0.08] bg-transparent p-0.5"
        />
        <span className="text-[10px] font-mono text-white/25">{value}</span>
      </div>
    </div>
  );
}
