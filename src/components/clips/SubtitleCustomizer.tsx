import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Type, Palette, AlignVerticalSpaceAround, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SubtitlePreferences {
  position: 'top' | 'center' | 'bottom';
  format: 'single-line' | 'multi-line' | 'karaoke' | 'progressive';
  font: 'Arial' | 'Inter' | 'Roboto' | 'Montserrat' | 'Poppins';
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
}

const DEFAULT_PREFERENCES: SubtitlePreferences = {
  position: 'center',
  format: 'multi-line',
  font: 'Inter',
  fontSize: 24,
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.7,
  bold: true,
  italic: false,
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 2,
  shadow: false,
  shadowColor: '#000000',
  maxCharsPerLine: 40,
  marginVertical: 40,
};

interface SubtitleCustomizerProps {
  initialPreferences?: Partial<SubtitlePreferences>;
  onSave: (preferences: SubtitlePreferences) => void;
  onCancel?: () => void;
  clipId?: string;
}

export const SubtitleCustomizer = ({
  initialPreferences,
  onSave,
  onCancel,
  clipId,
}: SubtitleCustomizerProps) => {
  const [preferences, setPreferences] = useState<SubtitlePreferences>({
    ...DEFAULT_PREFERENCES,
    ...initialPreferences,
  });

  const updatePreference = <K extends keyof SubtitlePreferences>(
    key: K,
    value: SubtitlePreferences[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(preferences);
  };

  const handleReset = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Personalizar Legendas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Position */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <AlignVerticalSpaceAround className="w-4 h-4" />
            Posicionamento
          </Label>
          <Select
            value={preferences.position}
            onValueChange={(value) => updatePreference('position', value as SubtitlePreferences['position'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">Topo</SelectItem>
              <SelectItem value="center">Centro</SelectItem>
              <SelectItem value="bottom">Inferior</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Format */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Type className="w-4 h-4" />
            Formato de Exibição
          </Label>
          <Select
            value={preferences.format}
            onValueChange={(value) => updatePreference('format', value as SubtitlePreferences['format'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single-line">Linha Única</SelectItem>
              <SelectItem value="multi-line">Múltiplas Linhas</SelectItem>
              <SelectItem value="karaoke">Efeito Karaokê</SelectItem>
              <SelectItem value="progressive">Animação Progressiva</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Font */}
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
              <SelectItem value="Arial">Arial</SelectItem>
              <SelectItem value="Inter">Inter</SelectItem>
              <SelectItem value="Roboto">Roboto</SelectItem>
              <SelectItem value="Montserrat">Montserrat</SelectItem>
              <SelectItem value="Poppins">Poppins</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Font Size */}
        <div className="space-y-2">
          <Label>Tamanho da Fonte: {preferences.fontSize}px</Label>
          <Slider
            value={[preferences.fontSize]}
            onValueChange={([value]) => updatePreference('fontSize', value)}
            min={16}
            max={48}
            step={2}
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
              className="flex-1 px-3 py-2 border rounded text-sm"
              placeholder="#FFFFFF"
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
                  <input
                    type="text"
                    value={preferences.outlineColor}
                    onChange={(e) => updatePreference('outlineColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2 pl-4">
                <Label className="text-sm">Largura do Contorno: {preferences.outlineWidth}px</Label>
                <Slider
                  value={[preferences.outlineWidth]}
                  onValueChange={([value]) => updatePreference('outlineWidth', value)}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>
            </>
          )}
        </div>

        {/* Shadow */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Sombra</Label>
            <Switch
              checked={preferences.shadow}
              onCheckedChange={(checked) => updatePreference('shadow', checked)}
            />
          </div>
          {preferences.shadow && (
            <div className="space-y-2 pl-4">
              <Label className="text-sm">Cor da Sombra</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={preferences.shadowColor}
                  onChange={(e) => updatePreference('shadowColor', e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <input
                  type="text"
                  value={preferences.shadowColor}
                  onChange={(e) => updatePreference('shadowColor', e.target.value)}
                  className="flex-1 px-3 py-2 border rounded text-sm"
                />
              </div>
            </div>
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
              <input
                type="text"
                value={preferences.backgroundColor}
                onChange={(e) => updatePreference('backgroundColor', e.target.value)}
                className="flex-1 px-3 py-2 border rounded text-sm"
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

        {/* Advanced Settings */}
        <div className="space-y-3">
          <Label>Configurações Avançadas</Label>
          <div className="space-y-2">
            <Label className="text-sm">Máximo de Caracteres por Linha: {preferences.maxCharsPerLine}</Label>
            <Slider
              value={[preferences.maxCharsPerLine]}
              onValueChange={([value]) => updatePreference('maxCharsPerLine', value)}
              min={20}
              max={60}
              step={5}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Margem Vertical: {preferences.marginVertical}px</Label>
            <Slider
              value={[preferences.marginVertical]}
              onValueChange={([value]) => updatePreference('marginVertical', value)}
              min={20}
              max={100}
              step={10}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} className="flex-1">
            Aplicar Legendas
          </Button>
          <Button onClick={handleReset} variant="outline">
            Resetar
          </Button>
          {onCancel && (
            <Button onClick={onCancel} variant="ghost">
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
