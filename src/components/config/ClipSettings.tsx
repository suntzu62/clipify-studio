import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Settings, Zap, Clock, Hash } from 'lucide-react';
import { ClipSettings as ClipSettingsType } from '@/types/project-config';

interface ClipSettingsProps {
  settings: ClipSettingsType;
  onChange: (settings: ClipSettingsType) => void;
}

export const ClipSettings = ({ settings, onChange }: ClipSettingsProps) => {
  const updateSetting = <K extends keyof ClipSettingsType>(
    key: K,
    value: ClipSettingsType[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* AI Clipping Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            AI Clipping
          </CardTitle>
          <CardDescription>
            Deixe a IA identificar automaticamente os melhores momentos do seu vídeo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="ai-clipping">Detecção Automática</Label>
              <p className="text-sm text-muted-foreground">
                Usar inteligência artificial para detectar os melhores clipes
              </p>
            </div>
            <Switch
              id="ai-clipping"
              checked={settings.aiClipping}
              onCheckedChange={(checked) =>
                updateSetting('aiClipping', checked)
              }
            />
          </div>

          {!settings.aiClipping && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Com AI Clipping desativado, você terá controle manual sobre os momentos selecionados.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Selection */}
      {settings.aiClipping && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Modelo de Detecção
            </CardTitle>
            <CardDescription>
              Escolha o modelo de IA para análise do vídeo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label htmlFor="model">Modelo</Label>
              <Select
                value={settings.model}
                onValueChange={(value: ClipSettingsType['model']) =>
                  updateSetting('model', value)
                }
              >
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ClipAnything">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Recomendado</Badge>
                      ClipAnything - Melhor qualidade
                    </div>
                  </SelectItem>
                  <SelectItem value="Smart">
                    Smart - Balanceado
                  </SelectItem>
                  <SelectItem value="Fast">
                    Fast - Mais rápido
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                ClipAnything oferece os melhores resultados para conteúdo viral
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clip Duration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Duração dos Clipes
          </CardTitle>
          <CardDescription>
            Configure a duração ideal para seus clipes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target Duration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Duração Alvo</Label>
              <span className="text-sm font-medium">{settings.targetDuration}s</span>
            </div>
            <Slider
              value={[settings.targetDuration]}
              onValueChange={([value]) => updateSetting('targetDuration', value)}
              min={30}
              max={90}
              step={10}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>30s (curto)</span>
              <span>60s (ideal)</span>
              <span>90s (longo)</span>
            </div>
          </div>

          {/* Duration Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-duration">Duração Mínima</Label>
              <Select
                value={settings.minDuration.toString()}
                onValueChange={(value) =>
                  updateSetting('minDuration', parseInt(value))
                }
              >
                <SelectTrigger id="min-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15s</SelectItem>
                  <SelectItem value="20">20s</SelectItem>
                  <SelectItem value="25">25s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-duration">Duração Máxima</Label>
              <Select
                value={settings.maxDuration.toString()}
                onValueChange={(value) =>
                  updateSetting('maxDuration', parseInt(value))
                }
              >
                <SelectTrigger id="max-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60s</SelectItem>
                  <SelectItem value="75">75s</SelectItem>
                  <SelectItem value="90">90s</SelectItem>
                  <SelectItem value="120">120s</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Number of Clips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-primary" />
            Número de Clipes
          </CardTitle>
          <CardDescription>
            Quantos clipes você deseja gerar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Quantidade</Label>
            <span className="text-sm font-medium">{settings.clipCount} clipes</span>
          </div>
          <Slider
            value={[settings.clipCount]}
            onValueChange={([value]) => updateSetting('clipCount', value)}
            min={3}
            max={15}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>3 (poucos)</span>
            <span>8 (recomendado)</span>
            <span>15 (muitos)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 8-12 clipes é ideal para ter variedade sem perder qualidade
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
