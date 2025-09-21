import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Type, 
  Palette, 
  Download, 
  Eye, 
  Sparkles,
  Zap,
  Star,
  Crown
} from 'lucide-react';
import { TemplateLibrary } from '@/components/captions/TemplateLibrary';
import { KeywordEmphasis } from '@/components/captions/KeywordEmphasis';
import { useToast } from '@/hooks/use-toast';
import { Clip } from '@/hooks/useClipList';
import posthog from 'posthog-js';

interface CaptionDesignerProps {
  clip: Clip;
  onSave?: (captions: CaptionData) => void;
  onExport?: (format: 'srt' | 'ass') => void;
}

interface CaptionData {
  template: string;
  font: string;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  backgroundColor: string;
  backgroundOpacity: number;
  animation: string;
  position: 'top' | 'center' | 'bottom';
  emphasis: KeywordEmphasisData[];
}

interface KeywordEmphasisData {
  word: string;
  color: string;
  scale: number;
  emoji?: string;
}

const FONT_FAMILIES = [
  'Inter',
  'Roboto',
  'Open Sans', 
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Dancing Script',
  'Bebas Neue',
  'Oswald',
  'Source Sans Pro'
];

const ANIMATION_TYPES = [
  { value: 'none', label: 'Sem animação' },
  { value: 'fadeIn', label: 'Fade In' },
  { value: 'slideUp', label: 'Deslizar para cima' },
  { value: 'karaoke', label: 'Karaokê por palavra' },
  { value: 'typewriter', label: 'Máquina de escrever' },
  { value: 'bounce', label: 'Bounce' }
];

const DEFAULT_TEMPLATES = [
  {
    id: 'modern',
    name: 'Moderno',
    preview: '✨ Texto limpo e elegante',
    data: {
      font: 'Inter',
      fontSize: 24,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 2,
      shadowColor: '#000000',
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      backgroundColor: '#000000',
      backgroundOpacity: 0.8,
      animation: 'karaoke',
      position: 'bottom' as const
    }
  },
  {
    id: 'viral',
    name: 'Viral TikTok',
    preview: '🔥 Estilo que viraliza',
    data: {
      font: 'Bebas Neue',
      fontSize: 28,
      color: '#ffffff',
      strokeColor: '#ff0080',
      strokeWidth: 3,
      shadowColor: '#000000',
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
      animation: 'bounce',
      position: 'center' as const
    }
  },
  {
    id: 'elegant',
    name: 'Elegante',
    preview: '👑 Sofisticado e premium',
    data: {
      font: 'Playfair Display',
      fontSize: 26,
      color: '#f8f9fa',
      strokeColor: '#212529',
      strokeWidth: 1,
      shadowColor: '#6c757d',
      shadowOffsetX: 1,
      shadowOffsetY: 1,
      backgroundColor: '#212529',
      backgroundOpacity: 0.9,
      animation: 'fadeIn',
      position: 'bottom' as const
    }
  }
];

export const CaptionDesigner = ({ clip, onSave, onExport }: CaptionDesignerProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState('modern');
  const [captionData, setCaptionData] = useState<CaptionData>({
    ...DEFAULT_TEMPLATES[0].data,
    template: 'modern',
    emphasis: []
  });
  const [keywords, setKeywords] = useState<KeywordEmphasisData[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [userPlan, setUserPlan] = useState<'free' | 'pro' | 'scale'>('free');
  const { toast } = useToast();

  useEffect(() => {
    posthog.capture('caption_designer_open', { clipId: clip.id });
  }, [clip.id]);

  const handleTemplateSelect = (templateId: string) => {
    const template = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setCaptionData({
        ...template.data,
        template: templateId,
        emphasis: []
      });
      
      posthog.capture('caption_template_select', { 
        clipId: clip.id, 
        template: templateId 
      });
    }
  };

  const handleDataChange = (field: keyof CaptionData, value: any) => {
    setCaptionData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    const finalData = {
      ...captionData,
      emphasis: keywords
    };
    
    onSave?.(finalData);
    
    posthog.capture('caption_save', { 
      clipId: clip.id, 
      template: selectedTemplate,
      animation: captionData.animation,
      emphasisCount: keywords.length
    });

    toast({
      title: "Legendas salvas! 📝",
      description: "Estilo aplicado com sucesso"
    });
  };

  const handleExport = (format: 'srt' | 'ass') => {
    onExport?.(format);
    
    posthog.capture('caption_export', { 
      clipId: clip.id, 
      format 
    });

    toast({
      title: `Export ${format.toUpperCase()} iniciado! 📥`,
      description: "Arquivo será baixado em instantes"
    });
  };

  const addWatermarkWarning = userPlan === 'free';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="w-5 h-5" />
            Caption Designer
            {addWatermarkWarning && (
              <Badge variant="outline" className="text-xs">
                Marca d'água no Free
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Template Library */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Templates Rápidos</Label>
            <div className="grid grid-cols-1 gap-2">
              {DEFAULT_TEMPLATES.map((template) => (
                <Button
                  key={template.id}
                  variant={selectedTemplate === template.id ? "default" : "outline"}
                  onClick={() => handleTemplateSelect(template.id)}
                  className="p-3 h-auto text-left justify-start"
                >
                  <div>
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-muted-foreground">{template.preview}</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="style" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="style" className="text-xs">
                <Palette className="w-3 h-3 mr-1" />
                Estilo
              </TabsTrigger>
              <TabsTrigger value="animation" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Animação
              </TabsTrigger>
              <TabsTrigger value="emphasis" className="text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                Ênfase
              </TabsTrigger>
            </TabsList>

            <TabsContent value="style" className="space-y-4">
              {/* Font Settings */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Fonte</Label>
                <Select 
                  value={captionData.font} 
                  onValueChange={(value) => handleDataChange('font', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Tamanho: {captionData.fontSize}px</Label>
                <Slider
                  value={[captionData.fontSize]}
                  onValueChange={(value) => handleDataChange('fontSize', value[0])}
                  min={16}
                  max={48}
                  step={2}
                />
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Cor do Texto</Label>
                  <Input
                    type="color"
                    value={captionData.color}
                    onChange={(e) => handleDataChange('color', e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Cor da Borda</Label>
                  <Input
                    type="color"
                    value={captionData.strokeColor}
                    onChange={(e) => handleDataChange('strokeColor', e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Espessura da Borda: {captionData.strokeWidth}px</Label>
                <Slider
                  value={[captionData.strokeWidth]}
                  onValueChange={(value) => handleDataChange('strokeWidth', value[0])}
                  min={0}
                  max={5}
                  step={1}
                />
              </div>

              {/* Position */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Posição</Label>
                <Select 
                  value={captionData.position} 
                  onValueChange={(value) => handleDataChange('position', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Topo</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                    <SelectItem value="bottom">Embaixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="animation" className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Tipo de Animação</Label>
                <Select 
                  value={captionData.animation} 
                  onValueChange={(value) => handleDataChange('animation', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANIMATION_TYPES.map((anim) => (
                      <SelectItem key={anim.value} value={anim.value}>
                        {anim.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {captionData.animation === 'karaoke' && (
                <div className="p-3 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Karaokê</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Palavras destacam conforme o áudio progride
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="emphasis" className="space-y-4">
              <KeywordEmphasis
                keywords={keywords}
                onKeywordsChange={setKeywords}
                transcript={clip.transcript || []}
              />
            </TabsContent>
          </Tabs>

          {/* Preview Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span className="text-sm font-medium">Preview em Tempo Real</span>
            </div>
            <Switch
              checked={showPreview}
              onCheckedChange={setShowPreview}
            />
          </div>

          {/* Free Plan Warning */}
          {addWatermarkWarning && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">Plano Free</span>
              </div>
              <p className="text-xs text-yellow-700">
                Marca d'água discreta será adicionada. Upgrade para remover.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={handleSave} className="gap-1">
              <Type className="w-3 h-3" />
              Salvar
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleExport('srt')}
              className="gap-1 text-xs"
            >
              <Download className="w-3 h-3" />
              SRT
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleExport('ass')}
              className="gap-1 text-xs"
            >
              <Download className="w-3 h-3" />
              ASS
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};