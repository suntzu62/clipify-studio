import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { saveUserJob } from '@/lib/storage';
import type { Job } from '@/lib/jobs-api';
import {
  ArrowLeft,
  Sparkles,
  Settings,
  Type,
  Clock,
  Tag,
  Loader2,
  Info,
  Play,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  ProjectConfig,
  DEFAULT_CLIP_SETTINGS,
  DEFAULT_SUBTITLE_PREFERENCES,
} from '@/types/project-config';
import { ClipSettings } from '@/components/config/ClipSettings';
import { SubtitleConfig } from '@/components/config/SubtitleConfig';
import { GenreSelector } from '@/components/config/GenreSelector';
import { SpecificMomentsInput } from '@/components/config/SpecificMomentsInput';

export default function ProjectConfigure() {
  const { tempId } = useParams<{ tempId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState<ProjectConfig | null>(null);

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
      } catch (error: any) {
        console.error('Failed to load temp config:', error);
        toast({
          title: 'Erro ao carregar configuração',
          description: error.message || 'A configuração pode ter expirado (1 hora). Tente criar um novo projeto.',
          variant: 'destructive',
        });
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadTempConfig();
  }, [tempId, user, navigate, toast]);

  // Atualizar configuração local
  const updateConfig = (updates: Partial<ProjectConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
  };

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
    } catch (error: any) {
      console.error('Error starting processing:', error);
      toast({
        title: 'Erro ao iniciar processamento',
        description: error.message || 'Erro desconhecido ao criar o job',
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Button
              variant="ghost"
              onClick={() => navigate('/dashboard')}
              className="gap-2 hover:bg-primary/10"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>

            <Badge variant="secondary" className="gap-2">
              <Settings className="w-3 h-3" />
              Configuração
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Hero Section */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-3 flex items-center justify-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            Configure Seus Clipes
          </h1>
          <p className="text-muted-foreground text-lg">
            Personalize como seu vídeo será processado antes de gerar os clipes
          </p>
        </div>

        {/* Video Info */}
        <Card className="mb-8 bg-gradient-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Play className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">Vídeo Selecionado</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {config.youtubeUrl}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Tabs */}
        <Tabs defaultValue="clips" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="clips" className="gap-2">
              <Settings className="w-4 h-4" />
              Clipes
            </TabsTrigger>
            <TabsTrigger value="subtitles" className="gap-2">
              <Type className="w-4 h-4" />
              Legendas
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <Tag className="w-4 h-4" />
              Avançado
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-2">
              <Info className="w-4 h-4" />
              Resumo
            </TabsTrigger>
          </TabsList>

          {/* Clip Settings Tab */}
          <TabsContent value="clips">
            <ClipSettings
              settings={config.clipSettings}
              onChange={(settings) =>
                updateConfig({ clipSettings: settings })
              }
            />
          </TabsContent>

          {/* Subtitle Settings Tab */}
          <TabsContent value="subtitles">
            <SubtitleConfig
              preferences={config.subtitlePreferences}
              onChange={(preferences) =>
                updateConfig({ subtitlePreferences: preferences })
              }
            />
          </TabsContent>

          {/* Advanced Settings Tab */}
          <TabsContent value="advanced" className="space-y-6">
            {/* Genre Selector */}
            <GenreSelector
              value={config.genre || 'auto'}
              onChange={(genre) => updateConfig({ genre })}
            />

            {/* Specific Moments */}
            <SpecificMomentsInput
              value={config.specificMoments || ''}
              onChange={(specificMoments) =>
                updateConfig({ specificMoments })
              }
            />
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-primary" />
                  Resumo das Configurações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Número de Clipes
                    </p>
                    <p className="text-2xl font-bold">
                      {config.clipSettings.clipCount}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Duração Alvo
                    </p>
                    <p className="text-2xl font-bold">
                      {config.clipSettings.targetDuration}s
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Posição das Legendas
                    </p>
                    <p className="text-xl font-bold capitalize">
                      {config.subtitlePreferences.position}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Tamanho da Fonte
                    </p>
                    <p className="text-2xl font-bold">
                      {config.subtitlePreferences.fontSize}px
                    </p>
                  </div>
                </div>

                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>Tudo Pronto!</AlertTitle>
                  <AlertDescription>
                    Suas configurações estão salvas e serão aplicadas durante o
                    processamento. Clique em "Gerar Clipes Agora" para iniciar.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Button */}
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={handleStartProcessing}
            disabled={processing}
            className="gap-2 text-lg px-8 py-6"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Iniciando Processamento...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Gerar Clipes Agora
              </>
            )}
          </Button>
        </div>

        {/* Info Footer */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            💡 Dica: Você pode voltar e ajustar as configurações a qualquer
            momento antes de clicar em "Gerar Clipes"
          </p>
        </div>
      </div>
    </div>
  );
}
