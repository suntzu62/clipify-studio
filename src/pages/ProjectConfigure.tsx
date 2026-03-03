import { useState, useEffect, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { saveUserJob } from '@/lib/storage';
import type { Job } from '@/lib/jobs-api';
import {
  ArrowLeft,
  Type,
  Palette,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  type ProjectConfig,
  type SubtitlePreferences,
} from '@/types/project-config';

const SUBTITLE_PRESETS: Array<{
  id: string;
  label: string;
  hint: string;
  values: Partial<SubtitlePreferences>;
}> = [
  {
    id: 'viral',
    label: 'Viral Boost',
    hint: 'Alto contraste e impacto visual',
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
    },
  },
  {
    id: 'clean',
    label: 'Clean Glass',
    hint: 'Minimalista, elegante e legível',
    values: {
      font: 'Inter',
      fontSize: 30,
      bold: true,
      outline: false,
      shadow: true,
      backgroundOpacity: 0.58,
      format: 'single-line',
      position: 'bottom',
    },
  },
  {
    id: 'cinema',
    label: 'Cinema Neo',
    hint: 'Drama com profundidade em 3D',
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
    },
  },
];

const clampOpacity = (opacity: number) => Math.max(0, Math.min(1, opacity));

const hexToRgba = (hex: string, opacity: number): string => {
  const safe = hex.replace('#', '').trim();
  const normalized = safe.length === 3 ? safe.split('').map((char) => `${char}${char}`).join('') : safe;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(0, 0, 0, ${clampOpacity(opacity)})`;
  }

  const int = parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${clampOpacity(opacity)})`;
};

const extractYoutubeId = (url: string): string | null => {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtu.be')) {
      const [id] = parsed.pathname.split('/').filter(Boolean);
      return id || null;
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
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

export default function ProjectConfigure() {
  const { tempId } = useParams<{ tempId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('custom');

  const updateSubtitlePreference = <K extends keyof SubtitlePreferences>(
    key: K,
    value: SubtitlePreferences[K]
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      subtitlePreferences: {
        ...config.subtitlePreferences,
        [key]: value,
      },
    });
  };

  const applySubtitlePreset = (values: Partial<SubtitlePreferences>) => {
    if (!config) return;
    setConfig({
      ...config,
      subtitlePreferences: {
        ...config.subtitlePreferences,
        ...values,
      },
    });
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = SUBTITLE_PRESETS.find((item) => item.id === presetId);
    if (preset) {
      applySubtitlePreset(preset.values);
    }
  };

  // Carregar configuração temporária
  useEffect(() => {
    if (!tempId || !user) return;

    const loadTempConfig = async () => {
      try {
        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const apiKey = import.meta.env.VITE_API_KEY || '93560857g';

        const response = await fetch(
          `${baseUrl}/jobs/temp/${tempId}`,
          {
            headers: {
              'X-API-Key': apiKey,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Configuração não encontrada ou expirada');
        }

        const data = await response.json();

        // Validar que temos os dados necessários
        if (!data.clipSettings || !data.subtitlePreferences) {
          throw new Error('Dados de configuração incompletos');
        }

        setConfig(data);
      } catch (error: unknown) {
        console.error('Failed to load temp config:', error);
        toast({
          title: 'Erro ao carregar configuração',
          description: getErrorMessage(
            error,
            'A configuração pode ter expirado (1 hora). Tente criar um novo projeto.'
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

  // Iniciar processamento
  const handleStartProcessing = async () => {
    if (!config || !tempId) return;

    setProcessing(true);

    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const apiKey = import.meta.env.VITE_API_KEY || '93560857g';

      // Enviar apenas os campos que o backend espera
      const requestBody = {
        clipSettings: config.clipSettings,
        subtitlePreferences: config.subtitlePreferences,
        timeframe: config.timeframe,
        genre: config.genre,
        specificMoments: config.specificMoments,
      };

      console.log('Starting job with config:', requestBody);

      const response = await fetch(
        `${baseUrl}/jobs/temp/${tempId}/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify(requestBody),
        }
      );

      const responseData = await response.json();
      console.log('Server response:', responseData);

      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || 'Falha ao iniciar processamento');
      }

      const { jobId } = responseData;

      if (!jobId) {
        throw new Error('JobId não foi retornado pelo servidor');
      }

      console.log('Job created successfully:', jobId);

      // Salvar job no localStorage para que a página de detalhes possa encontrá-lo
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
        console.log('Job saved to localStorage:', job);
      }

      toast({
        title: 'Processamento iniciado! 🚀',
        description: 'Seu vídeo está sendo processado com as configurações escolhidas.',
      });

      // Navegar imediatamente - ProjectDetail agora busca do backend se necessário
      navigate(`/projects/${jobId}`);
    } catch (error: unknown) {
      console.error('Error starting processing:', error);
      toast({
        title: 'Erro ao iniciar processamento',
        description: getErrorMessage(error, 'Erro desconhecido ao criar o job'),
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return null;
  }

  const youtubeId = extractYoutubeId(config.youtubeUrl);
  const subtitlePreviewStyles: CSSProperties = {
    fontFamily: config.subtitlePreferences.font,
    color: config.subtitlePreferences.fontColor,
    backgroundColor: hexToRgba(
      config.subtitlePreferences.backgroundColor,
      config.subtitlePreferences.backgroundOpacity
    ),
    fontSize: `${Math.max(16, Math.min(34, config.subtitlePreferences.fontSize - 2))}px`,
    fontWeight: config.subtitlePreferences.bold ? 700 : 500,
    fontStyle: config.subtitlePreferences.italic ? 'italic' : 'normal',
    borderRadius: '14px',
    padding: '10px 16px',
    letterSpacing: '0.02em',
    textShadow: config.subtitlePreferences.shadow
      ? `0 6px 18px ${config.subtitlePreferences.shadowColor}`
      : 'none',
  };

  if (config.subtitlePreferences.outline) {
    subtitlePreviewStyles.WebkitTextStroke = `${config.subtitlePreferences.outlineWidth}px ${config.subtitlePreferences.outlineColor}`;
  }

  return (
    <div className="min-h-screen bg-[#0f0f14] text-white/90">
      {/* Header — clean, minimal */}
      <header className="border-b border-white/[0.06] bg-[#0f0f14]">
        <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="gap-2 text-white/60 hover:bg-white/[0.04] hover:text-white/90"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
        </div>
      </header>

      {/* Sticky CTA — narrower, follows scroll like OpusClip */}
      <div className="sticky top-0 z-20 bg-[#0f0f14] pb-4 pt-6">
        <div className="mx-auto max-w-[560px] px-6">
          <Button
            size="lg"
            onClick={handleStartProcessing}
            disabled={processing}
            className="h-12 w-full rounded-xl bg-white text-[#0f0f14] text-sm font-semibold shadow-none hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              'Gerar clipes agora'
            )}
          </Button>
        </div>
      </div>

      {/* Main — single column, centered, scrollable */}
      <main className="mx-auto max-w-[960px] px-6 pb-8">
        <div className="space-y-6">

          {/* Video preview — small, centered like OpusClip */}
          <div className="flex flex-col items-center gap-3">
            {youtubeId ? (
              <div className="w-full max-w-[420px] overflow-hidden rounded-lg border border-white/[0.08] bg-black">
                <div className="aspect-video w-full">
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`}
                    title="Pré-visualização do vídeo"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : (
              <div className="flex aspect-video w-full max-w-[420px] items-center justify-center rounded-lg border border-white/[0.08] bg-black/50 text-sm text-white/40">
                Prévia indisponível para este link.
              </div>
            )}
            <p className="text-center text-xs text-white/25">
              Ao continuar, você confirma que este é seu conteúdo original.
            </p>
          </div>

          {/* Clip settings — inline horizontal like OpusClip */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/50">
            <div className="flex items-center gap-2">
              <span>Estilo</span>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-white hover:text-white/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  {SUBTITLE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span>Formato</span>
              <Select
                value={config.subtitlePreferences.format}
                onValueChange={(value: SubtitlePreferences['format']) =>
                  updateSubtitlePreference('format', value)
                }
              >
                <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-white hover:text-white/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-line">Linha única</SelectItem>
                  <SelectItem value="multi-line">Múltiplas linhas</SelectItem>
                  <SelectItem value="karaoke">Karaoke</SelectItem>
                  <SelectItem value="progressive">Progressivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span>Posição</span>
              <Select
                value={config.subtitlePreferences.position}
                onValueChange={(value: SubtitlePreferences['position']) =>
                  updateSubtitlePreference('position', value)
                }
              >
                <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-white hover:text-white/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Topo</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                  <SelectItem value="bottom">Inferior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span>Fonte</span>
              <Select
                value={config.subtitlePreferences.font}
                onValueChange={(value: SubtitlePreferences['font']) =>
                  updateSubtitlePreference('font', value)
                }
              >
                <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-white hover:text-white/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="Montserrat">Montserrat</SelectItem>
                  <SelectItem value="Poppins">Poppins</SelectItem>
                  <SelectItem value="Roboto">Roboto</SelectItem>
                  <SelectItem value="Arial">Arial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.06]" />

          {/* Subtitle customization — clean card */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
            <h3 className="mb-5 flex items-center gap-2 text-sm font-medium text-white/70">
              <Type className="h-4 w-4" />
              Personalizar legendas
            </h3>

            <div className="space-y-5">
              {/* Sliders row */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-white/50">Tamanho da fonte</Label>
                    <span className="text-sm tabular-nums text-white/80">{config.subtitlePreferences.fontSize}px</span>
                  </div>
                  <Slider
                    value={[config.subtitlePreferences.fontSize]}
                    onValueChange={([value]) => updateSubtitlePreference('fontSize', value)}
                    min={16}
                    max={48}
                    step={1}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-white/50">Opacidade do fundo</Label>
                    <span className="text-sm tabular-nums text-white/80">
                      {Math.round(config.subtitlePreferences.backgroundOpacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[config.subtitlePreferences.backgroundOpacity * 100]}
                    onValueChange={([value]) => updateSubtitlePreference('backgroundOpacity', value / 100)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              </div>

              {/* Color pickers row */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm text-white/50">Cor do texto</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="color"
                      value={config.subtitlePreferences.fontColor}
                      onChange={(event) => updateSubtitlePreference('fontColor', event.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-lg border-white/[0.08] bg-transparent p-0.5"
                    />
                    <span className="text-xs font-mono text-white/30">{config.subtitlePreferences.fontColor}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-white/50">Cor de fundo</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="color"
                      value={config.subtitlePreferences.backgroundColor}
                      onChange={(event) => updateSubtitlePreference('backgroundColor', event.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-lg border-white/[0.08] bg-transparent p-0.5"
                    />
                    <span className="text-xs font-mono text-white/30">{config.subtitlePreferences.backgroundColor}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preset templates — phone mockup carousel like OpusClip */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
            {/* Tab header */}
            <div className="mb-5 flex items-center gap-6 border-b border-white/[0.06] pb-3">
              <span className="border-b-2 border-white/80 pb-2.5 text-sm font-medium text-white/90">
                Quick presets
              </span>
              <span className="pb-2.5 text-sm text-white/30 cursor-default">
                Meus templates
              </span>
            </div>

            {/* Phone mockup cards — horizontal scroll */}
            <div className="flex items-start gap-4 overflow-x-auto pb-2">
              {SUBTITLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetChange(preset.id)}
                  className="group flex flex-shrink-0 flex-col items-center gap-2.5"
                >
                  {/* Phone mockup (9:16 ratio) */}
                  <div
                    className={`relative flex h-[180px] w-[108px] flex-col items-center justify-end overflow-hidden rounded-xl border-2 bg-[#1a1a24] p-2 transition-all ${
                      selectedPreset === preset.id
                        ? 'border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]'
                        : 'border-white/[0.06] group-hover:border-white/15'
                    }`}
                  >
                    {/* Fake video content area */}
                    <div className="absolute inset-0 bg-gradient-to-b from-[#2a2a3a] via-[#1a1a24] to-[#0f0f14]" />

                    {/* Subtitle preview inside phone */}
                    <div className="relative z-10 mb-2 w-full">
                      <div
                        className="rounded-md px-1.5 py-1 text-center"
                        style={{
                          fontFamily: preset.values.font,
                          fontSize: '8px',
                          fontWeight: preset.values.bold ? 700 : 400,
                          fontStyle: preset.values.italic ? 'italic' : 'normal',
                          color: '#ffffff',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          lineHeight: '1.3',
                        }}
                      >
                        Momento viral detectado
                      </div>
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="rounded-md bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        Aplicar
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-white/60">{preset.label}</span>
                </button>
              ))}

              {/* Custom option */}
              <button
                type="button"
                onClick={() => handlePresetChange('custom')}
                className="group flex flex-shrink-0 flex-col items-center gap-2.5"
              >
                <div
                  className={`flex h-[180px] w-[108px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all ${
                    selectedPreset === 'custom'
                      ? 'border-white/25 bg-white/[0.04]'
                      : 'border-white/[0.08] group-hover:border-white/15'
                  }`}
                >
                  <Palette className="h-5 w-5 text-white/25" />
                  <span className="text-[11px] text-white/35">Personalizado</span>
                </div>
                <span className="text-xs text-white/60">Custom</span>
              </button>
            </div>
          </div>

          {/* Live preview — phone mockup with subtitle overlay */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white/50">Prévia da legenda</h3>
            <div className="flex justify-center">
              {/* Phone frame */}
              <div className="relative h-[320px] w-[180px] rounded-[24px] border-2 border-white/[0.1] bg-black shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
                {/* Fake video content */}
                <div className="absolute inset-0 overflow-hidden rounded-[22px]">
                  <div className="h-full w-full bg-gradient-to-b from-[#2d2040] via-[#1a1a2e] to-[#0a0a14]" />
                  {/* Simulated content lines */}
                  <div className="absolute left-4 right-4 top-10 space-y-2">
                    <div className="h-1.5 w-3/4 rounded-full bg-white/[0.06]" />
                    <div className="h-1.5 w-1/2 rounded-full bg-white/[0.04]" />
                  </div>
                  {/* Play icon */}
                  <div className="absolute left-1/2 top-[35%] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.08]">
                    <div className="ml-0.5 h-0 w-0 border-l-[10px] border-t-[6px] border-b-[6px] border-l-white/30 border-t-transparent border-b-transparent" />
                  </div>
                </div>

                {/* Subtitle overlay — positioned based on user setting */}
                <div
                  className="absolute left-3 right-3 z-10 flex justify-center"
                  style={{
                    ...(config.subtitlePreferences.position === 'top' && { top: '28px' }),
                    ...(config.subtitlePreferences.position === 'center' && { top: '50%', transform: 'translateY(-50%)' }),
                    ...((config.subtitlePreferences.position === 'bottom' || !config.subtitlePreferences.position) && { bottom: '24px' }),
                  }}
                >
                  <span
                    style={{
                      fontFamily: config.subtitlePreferences.font,
                      color: config.subtitlePreferences.fontColor || '#ffffff',
                      backgroundColor: hexToRgba(
                        config.subtitlePreferences.backgroundColor || '#000000',
                        config.subtitlePreferences.backgroundOpacity
                      ),
                      fontSize: `${Math.max(9, Math.min(14, Math.round(config.subtitlePreferences.fontSize * 0.35)))}px`,
                      fontWeight: config.subtitlePreferences.bold ? 700 : 400,
                      fontStyle: config.subtitlePreferences.italic ? 'italic' : 'normal',
                      padding: '3px 6px',
                      borderRadius: '4px',
                      lineHeight: '1.4',
                      textAlign: 'center' as const,
                      display: 'inline-block',
                      maxWidth: '100%',
                      wordBreak: 'break-word' as const,
                      letterSpacing: '0.01em',
                      textShadow: config.subtitlePreferences.shadow
                        ? `0 1px 4px ${config.subtitlePreferences.shadowColor || 'rgba(0,0,0,0.5)'}`
                        : 'none',
                      ...(config.subtitlePreferences.outline
                        ? { WebkitTextStroke: `${Math.max(0.5, (config.subtitlePreferences.outlineWidth || 1) * 0.3)}px ${config.subtitlePreferences.outlineColor || '#000'}` }
                        : {}),
                    }}
                  >
                    Momento viral com legenda premium
                  </span>
                </div>

                {/* Phone notch */}
                <div className="absolute left-1/2 top-2 z-20 h-[4px] w-12 -translate-x-1/2 rounded-full bg-white/[0.08]" />
                {/* Home indicator */}
                <div className="absolute bottom-2 left-1/2 z-20 h-[3px] w-10 -translate-x-1/2 rounded-full bg-white/[0.12]" />
              </div>
            </div>
          </div>

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>
      </main>
    </div>
  );
}
