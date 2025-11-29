import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Type, Palette, Layout, Sparkles } from 'lucide-react';
import { SubtitlePreferences } from '@/types/project-config';

interface SubtitleConfigProps {
  preferences: SubtitlePreferences;
  onChange: (preferences: SubtitlePreferences) => void;
}

export const SubtitleConfig = ({ preferences, onChange }: SubtitleConfigProps) => {
  const updatePreference = <K extends keyof SubtitlePreferences>(
    key: K,
    value: SubtitlePreferences[K]
  ) => {
    onChange({ ...preferences, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Position & Format */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            Posição e Formato
          </CardTitle>
          <CardDescription>
            Defina onde e como as legendas aparecerão no vídeo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Position */}
          <div className="space-y-2">
            <Label htmlFor="position">Posição</Label>
            <Select
              value={preferences.position}
              onValueChange={(value: SubtitlePreferences['position']) =>
                updatePreference('position', value)
              }
            >
              <SelectTrigger id="position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Topo</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="bottom">Inferior (recomendado)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <Label htmlFor="format">Formato</Label>
            <Select
              value={preferences.format}
              onValueChange={(value: SubtitlePreferences['format']) =>
                updatePreference('format', value)
              }
            >
              <SelectTrigger id="format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single-line">Linha única</SelectItem>
                <SelectItem value="multi-line">Múltiplas linhas (recomendado)</SelectItem>
                <SelectItem value="karaoke">Karaoke (palavra por palavra)</SelectItem>
                <SelectItem value="progressive">Progressivo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {preferences.format === 'karaoke' && '🎤 Destaca cada palavra conforme falada'}
              {preferences.format === 'multi-line' && '📝 Melhor legibilidade para textos longos'}
              {preferences.format === 'single-line' && '➖ Compacto, ideal para legendas curtas'}
              {preferences.format === 'progressive' && '⚡ Texto aparece progressivamente'}
            </p>
          </div>

          {/* Margin Vertical */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Margem Vertical</Label>
              <span className="text-sm font-medium">{preferences.marginVertical}px</span>
            </div>
            <Slider
              value={[preferences.marginVertical]}
              onValueChange={([value]) => updatePreference('marginVertical', value)}
              min={20}
              max={300}
              step={5}
              className="w-full"
            />
          </div>

          {/* Max Chars Per Line */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Caracteres por Linha</Label>
              <span className="text-sm font-medium">{preferences.maxCharsPerLine}</span>
            </div>
            <Slider
              value={[preferences.maxCharsPerLine]}
              onValueChange={([value]) => updatePreference('maxCharsPerLine', value)}
              min={20}
              max={60}
              step={2}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Recomendado: 25-30 caracteres para melhor legibilidade
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Font Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="w-5 h-5 text-primary" />
            Tipografia
          </CardTitle>
          <CardDescription>
            Personalize a fonte e o tamanho do texto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Font Family */}
          <div className="space-y-2">
            <Label htmlFor="font">Fonte</Label>
            <Select
              value={preferences.font}
              onValueChange={(value: SubtitlePreferences['font']) =>
                updatePreference('font', value)
              }
            >
              <SelectTrigger id="font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Inter">Inter (recomendado)</SelectItem>
                <SelectItem value="Arial">Arial</SelectItem>
                <SelectItem value="Roboto">Roboto</SelectItem>
                <SelectItem value="Montserrat">Montserrat</SelectItem>
                <SelectItem value="Poppins">Poppins</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tamanho da Fonte</Label>
              <span className="text-sm font-medium">{preferences.fontSize}px</span>
            </div>
            <Slider
              value={[preferences.fontSize]}
              onValueChange={([value]) => updatePreference('fontSize', value)}
              min={16}
              max={48}
              step={2}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>16px (pequeno)</span>
              <span>32px (ideal)</span>
              <span>48px (grande)</span>
            </div>
          </div>

          {/* Bold & Italic */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label htmlFor="bold" className="cursor-pointer">Negrito</Label>
              <Switch
                id="bold"
                checked={preferences.bold}
                onCheckedChange={(checked) => updatePreference('bold', checked)}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label htmlFor="italic" className="cursor-pointer">Itálico</Label>
              <Switch
                id="italic"
                checked={preferences.italic}
                onCheckedChange={(checked) => updatePreference('italic', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colors & Background */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Cores e Fundo
          </CardTitle>
          <CardDescription>
            Configure as cores do texto e do fundo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Font Color */}
          <div className="space-y-2">
            <Label htmlFor="font-color">Cor do Texto</Label>
            <div className="flex gap-2">
              <Input
                id="font-color"
                type="color"
                value={preferences.fontColor}
                onChange={(e) => updatePreference('fontColor', e.target.value)}
                className="w-20 h-10 cursor-pointer"
              />
              <Input
                type="text"
                value={preferences.fontColor}
                onChange={(e) => updatePreference('fontColor', e.target.value)}
                className="flex-1 font-mono"
                placeholder="#FFFFFF"
              />
            </div>
          </div>

          {/* Background Color */}
          <div className="space-y-2">
            <Label htmlFor="bg-color">Cor de Fundo</Label>
            <div className="flex gap-2">
              <Input
                id="bg-color"
                type="color"
                value={preferences.backgroundColor}
                onChange={(e) => updatePreference('backgroundColor', e.target.value)}
                className="w-20 h-10 cursor-pointer"
              />
              <Input
                type="text"
                value={preferences.backgroundColor}
                onChange={(e) => updatePreference('backgroundColor', e.target.value)}
                className="flex-1 font-mono"
                placeholder="#000000"
              />
            </div>
          </div>

          {/* Background Opacity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Opacidade do Fundo</Label>
              <span className="text-sm font-medium">{Math.round(preferences.backgroundOpacity * 100)}%</span>
            </div>
            <Slider
              value={[preferences.backgroundOpacity * 100]}
              onValueChange={([value]) => updatePreference('backgroundOpacity', value / 100)}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Effects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Efeitos
          </CardTitle>
          <CardDescription>
            Adicione contorno e sombra para melhor legibilidade
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Outline Toggle */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label htmlFor="outline" className="cursor-pointer">Contorno</Label>
              <p className="text-xs text-muted-foreground">Melhora legibilidade em fundos claros</p>
            </div>
            <Switch
              id="outline"
              checked={preferences.outline}
              onCheckedChange={(checked) => updatePreference('outline', checked)}
            />
          </div>

          {/* Outline Settings */}
          {preferences.outline && (
            <div className="space-y-4 pl-4 border-l-2 border-primary">
              <div className="space-y-2">
                <Label htmlFor="outline-color">Cor do Contorno</Label>
                <div className="flex gap-2">
                  <Input
                    id="outline-color"
                    type="color"
                    value={preferences.outlineColor}
                    onChange={(e) => updatePreference('outlineColor', e.target.value)}
                    className="w-20 h-10 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={preferences.outlineColor}
                    onChange={(e) => updatePreference('outlineColor', e.target.value)}
                    className="flex-1 font-mono"
                    placeholder="#000000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Espessura do Contorno</Label>
                  <span className="text-sm font-medium">{preferences.outlineWidth}px</span>
                </div>
                <Slider
                  value={[preferences.outlineWidth]}
                  onValueChange={([value]) => updatePreference('outlineWidth', value)}
                  min={1}
                  max={5}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Shadow Toggle */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label htmlFor="shadow" className="cursor-pointer">Sombra</Label>
              <p className="text-xs text-muted-foreground">Adiciona profundidade ao texto</p>
            </div>
            <Switch
              id="shadow"
              checked={preferences.shadow}
              onCheckedChange={(checked) => updatePreference('shadow', checked)}
            />
          </div>

          {/* Shadow Settings */}
          {preferences.shadow && (
            <div className="space-y-2 pl-4 border-l-2 border-primary">
              <Label htmlFor="shadow-color">Cor da Sombra</Label>
              <div className="flex gap-2">
                <Input
                  id="shadow-color"
                  type="color"
                  value={preferences.shadowColor}
                  onChange={(e) => updatePreference('shadowColor', e.target.value)}
                  className="w-20 h-10 cursor-pointer"
                />
                <Input
                  type="text"
                  value={preferences.shadowColor}
                  onChange={(e) => updatePreference('shadowColor', e.target.value)}
                  className="flex-1 font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Info */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Prévia em Tempo Real
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                As configurações de legendas serão aplicadas durante a renderização dos clipes.
                Para melhores resultados, escolha cores com alto contraste e ative o contorno.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
