import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Type, Palette, AlignVerticalSpaceAround, Sparkles, Zap, Wand2, Monitor, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SubtitlePreview } from './SubtitlePreview';
import { PlatformSelector } from '@/components/captions/SafeZoneOverlay';
import { AnimationType, AnimationSpeed, HighlightEffect, ANIMATION_PRESETS } from '@/types/caption-animations';
import { Platform, PLATFORM_CONFIGS, getSuggestedPosition } from '@/types/platform-safe-zones';
import { PRESET_TEMPLATES, TEMPLATE_METADATA, TEMPLATES_BY_CATEGORY, POPULAR_TEMPLATES } from '@/lib/template-presets';

export interface SubtitlePreferences {
  position: 'top' | 'center' | 'bottom';
  format: 'single-line' | 'multi-line' | 'karaoke' | 'progressive';
  font: 'Arial' | 'Inter' | 'Roboto' | 'Montserrat' | 'Poppins' | 'Bebas Neue' | 'Oswald';
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  bold: boolean;
  italic: boolean;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  shadowColor: string;
  maxCharsPerLine: number;
  marginVertical: number;
  // Opções de animação
  animationType: AnimationType;
  animationSpeed: AnimationSpeed;
  highlightColor: string;
  highlightEffect: HighlightEffect;
  glowIntensity: number;
  scaleAmount: number;
  // Plataforma alvo
  targetPlatform: Platform;
}

const DEFAULT_PREFERENCES: SubtitlePreferences = {
  position: 'center',
  format: 'karaoke',
  font: 'Poppins',
  fontSize: 72,
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.8,
  bold: true,
  italic: false,
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 3,
  shadow: false,
  shadowColor: '#000000',
  maxCharsPerLine: 25,
  marginVertical: 200,
  animationType: 'highlight',
  animationSpeed: 'normal',
  highlightColor: '#FFD700',
  highlightEffect: 'scale-color',
  glowIntensity: 5,
  scaleAmount: 1.2,
  targetPlatform: 'universal',
};

interface SubtitleCustomizerProps {
  initialPreferences?: Partial<SubtitlePreferences>;
  onSave: (preferences: SubtitlePreferences) => void;
  onSaveAndReprocess?: (preferences: SubtitlePreferences) => void;
  onCancel?: () => void;
  clipId?: string;
}

// Presets de animação para seleção rápida (6 mais populares)
const QUICK_ANIMATION_PRESETS = [
  { id: 'mrbeast', name: 'MrBeast', emoji: '🟡', color: '#FFFF00' },
  { id: 'hormozi', name: 'Hormozi', emoji: '🔴', color: '#FF0000' },
  { id: 'tiktokViral', name: 'TikTok', emoji: '💫', color: '#00FFFF' },
  { id: 'capcutTrending', name: 'CapCut', emoji: '🔥', color: '#FF6B35' },
  { id: 'instagramReels', name: 'Instagram', emoji: '📸', color: '#E1306C' },
  { id: 'minimal', name: 'Minimal', emoji: '⚪', color: '#FFFFFF' },
];

// Categorias de templates de estilo
const TEMPLATE_CATEGORIES = [
  { id: 'popular', name: 'Populares', emoji: '⭐' },
  { id: 'creator', name: 'Criadores', emoji: '👤' },
  { id: 'platform', name: 'Plataformas', emoji: '📱' },
  { id: 'professional', name: 'Profissional', emoji: '💼' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎮' },
  { id: 'minimal', name: 'Minimal', emoji: '✨' },
];

// Mapeamento de template ID para emoji e cor para exibição
const TEMPLATE_DISPLAY: Record<string, { emoji: string; color: string }> = {
  // MrBeast
  mrbeast: { emoji: '🟡', color: '#FFFF00' },
  mrbeastBold: { emoji: '💛', color: '#FFFF00' },
  mrbeastClean: { emoji: '⬜', color: '#FFFF00' },
  // Hormozi
  alexHormozi: { emoji: '🔴', color: '#FF0000' },
  hormoziBlue: { emoji: '🔵', color: '#1E40AF' },
  hormoziGreen: { emoji: '💵', color: '#059669' },
  hormoziGold: { emoji: '🥇', color: '#F59E0B' },
  // Iman Gadzhi
  imanGadzhi: { emoji: '✨', color: '#FFD700' },
  imanWhite: { emoji: '⬜', color: '#FFFFFF' },
  // Tech
  mkbhd: { emoji: '📱', color: '#EF4444' },
  techMinimal: { emoji: '🍎', color: '#000000' },
  // Vloggers
  caseyNeistat: { emoji: '🎬', color: '#FFE600' },
  garyVee: { emoji: '🔥', color: '#DC2626' },
  // Platform
  tiktokTrending: { emoji: '📲', color: '#00F2EA' },
  tiktokNeon: { emoji: '💜', color: '#FF0050' },
  instagramGlow: { emoji: '📸', color: '#E1306C' },
  instagramClean: { emoji: '🤍', color: '#0095F6' },
  youtubeShortsPop: { emoji: '▶️', color: '#FF0000' },
  // Podcast
  podcastClean: { emoji: '🎙️', color: '#60A5FA' },
  podcastBold: { emoji: '🎧', color: '#7C3AED' },
  joRogan: { emoji: '🟢', color: '#10B981' },
  // News
  newsDocumentary: { emoji: '📰', color: '#1E3A8A' },
  breakingNews: { emoji: '🚨', color: '#DC2626' },
  cinematic: { emoji: '🎥', color: '#FFFFFF' },
  // Karaoke
  karaokeNeon: { emoji: '🎤', color: '#00FFFF' },
  karaokeClassic: { emoji: '🎵', color: '#000080' },
  // Minimal
  minimal: { emoji: '⚪', color: '#FFFFFF' },
  subtleElegant: { emoji: '🪶', color: '#FFFFFF' },
  modernSans: { emoji: '💎', color: '#A78BFA' },
  // Professional
  professional: { emoji: '💼', color: '#1E3A8A' },
  corporate: { emoji: '🏢', color: '#0F172A' },
  startup: { emoji: '🚀', color: '#6366F1' },
  // Gaming
  gaming: { emoji: '🎮', color: '#00FF00' },
  esports: { emoji: '🏆', color: '#7C3AED' },
};

export const SubtitleCustomizer = ({
  initialPreferences,
  onSave,
  onSaveAndReprocess,
  onCancel,
  clipId,
}: SubtitleCustomizerProps) => {
  const savedPreferences: SubtitlePreferences = {
    ...DEFAULT_PREFERENCES,
    ...initialPreferences,
  };

  const [preferences, setPreferences] = useState<SubtitlePreferences>(savedPreferences);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeStyleTemplate, setActiveStyleTemplate] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('popular');

  const updatePreference = <K extends keyof SubtitlePreferences>(
    key: K,
    value: SubtitlePreferences[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null); // Clear preset when manually editing
  };

  const applyPreset = (presetId: string) => {
    const preset = ANIMATION_PRESETS[presetId];
    if (preset) {
      setPreferences((prev) => ({
        ...prev,
        animationType: preset.type || prev.animationType,
        highlightColor: preset.highlightColor || prev.highlightColor,
        highlightEffect: preset.highlightEffect || prev.highlightEffect,
        animationSpeed: preset.speed || prev.animationSpeed,
        scaleAmount: preset.scaleAmount || prev.scaleAmount,
        glowIntensity: preset.glowIntensity || prev.glowIntensity,
      }));
      setActivePreset(presetId);
    }
  };

  // Aplica um template de estilo completo
  const applyStyleTemplate = (templateId: string) => {
    const template = PRESET_TEMPLATES[templateId];
    if (template) {
      setPreferences((prev) => ({
        ...prev,
        font: template.font as SubtitlePreferences['font'] || prev.font,
        fontSize: template.fontSize,
        fontColor: template.fontColor,
        backgroundColor: template.backgroundColor,
        backgroundOpacity: template.backgroundOpacity,
        bold: template.bold,
        italic: template.italic,
        outline: template.outline,
        outlineColor: template.outlineColor || prev.outlineColor,
        outlineWidth: template.outlineWidth || prev.outlineWidth,
        shadow: template.shadow,
        shadowColor: template.shadowColor || prev.shadowColor,
        position: template.position,
        maxCharsPerLine: template.maxCharsPerLine || prev.maxCharsPerLine,
        marginVertical: template.marginBottom || template.marginTop || prev.marginVertical,
        highlightColor: template.highlightColor || prev.highlightColor,
      }));
      setActiveStyleTemplate(templateId);
      setActivePreset(null);
    }
  };

  // Retorna os templates para a categoria selecionada
  const getTemplatesForCategory = (category: string): string[] => {
    if (category === 'popular') {
      return POPULAR_TEMPLATES;
    }
    return TEMPLATES_BY_CATEGORY[category as keyof typeof TEMPLATES_BY_CATEGORY] || [];
  };

  const handleSave = () => onSave(preferences);
  const handleSaveAndReprocess = () => onSaveAndReprocess?.(preferences);
  const handleReset = () => {
    setPreferences(savedPreferences);
    setActivePreset(null);
  };

  // Handler para mudança de plataforma
  const handlePlatformChange = (platform: Platform) => {
    const suggestedPosition = getSuggestedPosition(platform);
    setPreferences((prev) => ({
      ...prev,
      targetPlatform: platform,
      position: suggestedPosition, // Auto-ajustar posição baseado na plataforma
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Preview Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Preview em Tempo Real
        </h3>
        <SubtitlePreview
          preferences={preferences}
          platform={preferences.targetPlatform}
          showSafeZones={true}
          animationConfig={{
            type: preferences.animationType,
            speed: preferences.animationSpeed,
            highlightColor: preferences.highlightColor,
            highlightEffect: preferences.highlightEffect,
            glowIntensity: preferences.glowIntensity,
            scaleAmount: preferences.scaleAmount,
            glowColor: preferences.highlightColor,
            showWordByWord: preferences.format === 'progressive',
            wordDuration: preferences.animationSpeed === 'fast' ? 200 : preferences.animationSpeed === 'slow' ? 500 : 350,
            bounceHeight: 12,
          }}
          sampleText="Isso vai viralizar com certeza!"
        />

        {/* Platform Selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            Plataforma Alvo
          </Label>
          <PlatformSelector
            selected={preferences.targetPlatform}
            onChange={handlePlatformChange}
            showDescription={true}
          />
        </div>

        {/* Style Templates */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              Templates de Estilo
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              className="text-xs"
            >
              {showAllTemplates ? (
                <>Menos <ChevronUp className="w-3 h-3 ml-1" /></>
              ) : (
                <>Ver todos (30+) <ChevronDown className="w-3 h-3 ml-1" /></>
              )}
            </Button>
          </div>

          {!showAllTemplates ? (
            // Mostrar apenas os 6 populares
            <div className="grid grid-cols-3 gap-2">
              {POPULAR_TEMPLATES.map((templateId) => {
                const metadata = TEMPLATE_METADATA[templateId];
                const display = TEMPLATE_DISPLAY[templateId];
                if (!metadata || !display) return null;
                return (
                  <button
                    key={templateId}
                    onClick={() => applyStyleTemplate(templateId)}
                    className={cn(
                      'p-3 rounded-lg border-2 transition-all text-center',
                      activeStyleTemplate === templateId
                        ? 'border-primary bg-primary/20'
                        : 'border-white/10 hover:border-white/30 bg-white/5'
                    )}
                  >
                    <div className="text-xl mb-1">{display.emoji}</div>
                    <div className="text-xs font-medium truncate">{metadata.name.split(' ')[0]}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            // Mostrar todos com tabs de categoria
            <div className="space-y-3">
              <div className="flex gap-1 overflow-x-auto pb-2">
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all',
                      selectedCategory === cat.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white/5 hover:bg-white/10'
                    )}
                  >
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto pr-1">
                {getTemplatesForCategory(selectedCategory).map((templateId) => {
                  const metadata = TEMPLATE_METADATA[templateId];
                  const display = TEMPLATE_DISPLAY[templateId];
                  if (!metadata || !display) return null;
                  return (
                    <button
                      key={templateId}
                      onClick={() => applyStyleTemplate(templateId)}
                      className={cn(
                        'p-2.5 rounded-lg border-2 transition-all text-center',
                        activeStyleTemplate === templateId
                          ? 'border-primary bg-primary/20'
                          : 'border-white/10 hover:border-white/30 bg-white/5'
                      )}
                      title={metadata.description}
                    >
                      <div
                        className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-lg"
                        style={{ backgroundColor: display.color + '30' }}
                      >
                        {display.emoji}
                      </div>
                      <div className="text-[10px] font-medium truncate">{metadata.name}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{metadata.creator}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Quick Animation Presets */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Animação Rápida
          </Label>
          <div className="grid grid-cols-6 gap-1.5">
            {QUICK_ANIMATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  'p-2 rounded-lg border-2 transition-all text-center',
                  activePreset === preset.id
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-white/10 hover:border-white/30 bg-white/5'
                )}
                title={preset.name}
              >
                <div className="text-base">{preset.emoji}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Section */}
      <Card className="w-full max-h-[80vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="w-5 h-5 text-primary" />
            Configurações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ============ ANIMAÇÃO WORD-BY-WORD ============ */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 space-y-4">
            <Label className="flex items-center gap-2 text-purple-300">
              <Zap className="w-4 h-4" />
              Animação Word-by-Word
            </Label>

            {/* Animation Type */}
            <div className="space-y-2">
              <Label className="text-sm">Tipo de Animação</Label>
              <Select
                value={preferences.animationType}
                onValueChange={(value) => updatePreference('animationType', value as AnimationType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">➖ Sem Animação</SelectItem>
                  <SelectItem value="highlight">✨ Highlight (Cor)</SelectItem>
                  <SelectItem value="scale">📈 Scale Pop</SelectItem>
                  <SelectItem value="bounce">🎾 Bounce</SelectItem>
                  <SelectItem value="glow">💫 Neon Glow</SelectItem>
                  <SelectItem value="background">🎨 Background</SelectItem>
                  <SelectItem value="underline">📝 Underline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Highlight Color */}
            {preferences.animationType !== 'none' && (
              <div className="space-y-2">
                <Label className="text-sm">Cor do Destaque</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={preferences.highlightColor}
                    onChange={(e) => updatePreference('highlightColor', e.target.value)}
                    className="w-12 h-10 rounded border cursor-pointer"
                  />
                  <div className="flex gap-1">
                    {['#FFD700', '#FF0000', '#00FFFF', '#FF6B35', '#00FF00', '#FF69B4'].map((color) => (
                      <button
                        key={color}
                        onClick={() => updatePreference('highlightColor', color)}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all',
                          preferences.highlightColor === color ? 'border-white scale-110' : 'border-transparent'
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Animation Speed */}
            {preferences.animationType !== 'none' && (
              <div className="space-y-2">
                <Label className="text-sm">Velocidade</Label>
                <Select
                  value={preferences.animationSpeed}
                  onValueChange={(value) => updatePreference('animationSpeed', value as AnimationSpeed)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">🐢 Lento</SelectItem>
                    <SelectItem value="normal">⚡ Normal</SelectItem>
                    <SelectItem value="fast">🚀 Rápido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Scale Amount (for scale/bounce) */}
            {(preferences.animationType === 'scale' || preferences.animationType === 'bounce' || preferences.animationType === 'highlight') && (
              <div className="space-y-2">
                <Label className="text-sm">Tamanho do Pop: {(preferences.scaleAmount * 100).toFixed(0)}%</Label>
                <Slider
                  value={[preferences.scaleAmount * 100]}
                  onValueChange={([value]) => updatePreference('scaleAmount', value / 100)}
                  min={100}
                  max={150}
                  step={5}
                />
              </div>
            )}

            {/* Glow Intensity (for glow) */}
            {preferences.animationType === 'glow' && (
              <div className="space-y-2">
                <Label className="text-sm">Intensidade do Glow: {preferences.glowIntensity}</Label>
                <Slider
                  value={[preferences.glowIntensity]}
                  onValueChange={([value]) => updatePreference('glowIntensity', value)}
                  min={1}
                  max={15}
                  step={1}
                />
              </div>
            )}
          </div>

          {/* ============ POSIÇÃO E FORMATO ============ */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <AlignVerticalSpaceAround className="w-4 h-4" />
              Posição
            </Label>
            <Select
              value={preferences.position}
              onValueChange={(value) => updatePreference('position', value as SubtitlePreferences['position'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">⬆️ Topo</SelectItem>
                <SelectItem value="center">⬛ Centro</SelectItem>
                <SelectItem value="bottom">⬇️ Inferior</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <Label>Formato de Exibição</Label>
            <Select
              value={preferences.format}
              onValueChange={(value) => updatePreference('format', value as SubtitlePreferences['format'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="karaoke">🎤 Karaokê (Word-by-Word)</SelectItem>
                <SelectItem value="progressive">✨ Progressivo (Aparece Palavra)</SelectItem>
                <SelectItem value="single-line">➖ Linha Única</SelectItem>
                <SelectItem value="multi-line">📝 Múltiplas Linhas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ============ FONTE ============ */}
          <div className="space-y-2">
            <Label>Fonte</Label>
            <Select
              value={preferences.font}
              onValueChange={(value) => updatePreference('font', value as SubtitlePreferences['font'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Poppins">Poppins (Viral) ⭐</SelectItem>
                <SelectItem value="Montserrat">Montserrat (Bold)</SelectItem>
                <SelectItem value="Bebas Neue">Bebas Neue (Cinema)</SelectItem>
                <SelectItem value="Oswald">Oswald (Modern)</SelectItem>
                <SelectItem value="Inter">Inter (Clean)</SelectItem>
                <SelectItem value="Roboto">Roboto</SelectItem>
                <SelectItem value="Arial">Arial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <Label>Tamanho: {preferences.fontSize}px</Label>
            <Slider
              value={[preferences.fontSize]}
              onValueChange={([value]) => updatePreference('fontSize', value)}
              min={24}
              max={120}
              step={4}
            />
          </div>

          {/* Font Color */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Cor do Texto
            </Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={preferences.fontColor}
                onChange={(e) => updatePreference('fontColor', e.target.value)}
                className="w-12 h-12 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={preferences.fontColor}
                onChange={(e) => updatePreference('fontColor', e.target.value)}
                className="flex-1 px-3 py-2 border rounded text-sm bg-background"
              />
            </div>
          </div>

          {/* Style Options */}
          <div className="space-y-3">
            <Label>Estilo</Label>
            <div className="flex items-center justify-between">
              <span className="text-sm">Negrito</span>
              <Switch
                checked={preferences.bold}
                onCheckedChange={(checked) => updatePreference('bold', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Itálico</span>
              <Switch
                checked={preferences.italic}
                onCheckedChange={(checked) => updatePreference('italic', checked)}
              />
            </div>
          </div>

          {/* Outline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Contorno</Label>
              <Switch
                checked={preferences.outline}
                onCheckedChange={(checked) => updatePreference('outline', checked)}
              />
            </div>
            {preferences.outline && (
              <>
                <div className="space-y-2 pl-4">
                  <Label className="text-sm">Cor do Contorno</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={preferences.outlineColor}
                      onChange={(e) => updatePreference('outlineColor', e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                  </div>
                </div>
                <div className="space-y-2 pl-4">
                  <Label className="text-sm">Largura: {preferences.outlineWidth}px</Label>
                  <Slider
                    value={[preferences.outlineWidth]}
                    onValueChange={([value]) => updatePreference('outlineWidth', value)}
                    min={1}
                    max={8}
                    step={1}
                  />
                </div>
              </>
            )}
          </div>

          {/* Background */}
          <div className="space-y-3">
            <Label>Fundo</Label>
            <div className="space-y-2">
              <Label className="text-sm">Cor do Fundo</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={preferences.backgroundColor}
                  onChange={(e) => updatePreference('backgroundColor', e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Opacidade: {Math.round(preferences.backgroundOpacity * 100)}%</Label>
              <Slider
                value={[preferences.backgroundOpacity * 100]}
                onValueChange={([value]) => updatePreference('backgroundOpacity', value / 100)}
                min={0}
                max={100}
                step={5}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-4 sticky bottom-0 bg-card pb-2">
            {onSaveAndReprocess && (
              <Button onClick={handleSaveAndReprocess} className="w-full" size="lg">
                <Zap className="w-4 h-4 mr-2" />
                Aplicar e Reprocessar
              </Button>
            )}
            <Button onClick={handleSave} variant={onSaveAndReprocess ? "outline" : "default"} className="w-full">
              {onSaveAndReprocess ? 'Salvar Sem Reprocessar' : 'Aplicar Legendas'}
            </Button>
            <div className="flex gap-2">
              <Button onClick={handleReset} variant="outline" className="flex-1">
                Resetar
              </Button>
              {onCancel && (
                <Button onClick={onCancel} variant="ghost" className="flex-1">
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
