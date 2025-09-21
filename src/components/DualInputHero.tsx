import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeroInput } from '@/components/HeroInput';
import { FileUploadZone } from '@/components/FileUploadZone';
import { Youtube, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DualInputHeroProps {
  className?: string;
  onOpenDemo: () => void;
  prefillUrl?: string | null;
}

export function DualInputHero({ className, onOpenDemo, prefillUrl }: DualInputHeroProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');

  return (
    <Card className={cn("border-2 border-dashed border-muted-foreground/25 bg-gradient-card", className)}>
      <CardContent className="p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2">Transforme seu conteúdo em clipes virais</h2>
          <p className="text-muted-foreground">
            Cole um link do YouTube ou faça upload do seu arquivo
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'url' | 'upload')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="url" className="gap-2">
              <Youtube className="w-4 h-4" />
              Link do YouTube
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload de Arquivo
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="url" className="space-y-4">
            <HeroInput 
              onOpenDemo={onOpenDemo} 
              prefillUrl={prefillUrl} 
              className="space-y-4"
            />
          </TabsContent>
          
          <TabsContent value="upload" className="space-y-4">
            <FileUploadZone />
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Formatos suportados: MP4, MOV, AVI • Máximo: 2GB
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 text-center">
          <button 
            onClick={onOpenDemo}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            🎬 Ver exemplo em 60 segundos
          </button>
        </div>
      </CardContent>
    </Card>
  );
}