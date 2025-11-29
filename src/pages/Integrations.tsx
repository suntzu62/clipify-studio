import { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useYouTubeAccount } from '@/hooks/useYouTubeAccount';
import { toast } from 'sonner';
import { Play, Settings as SettingsIcon, Video, Cable, Youtube, CheckCircle2, AlertCircle } from 'lucide-react';

const Integrations = () => {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { account, isConnected, isExpired, loading } = useYouTubeAccount();

  // Detect OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'youtube') {
      toast.success('YouTube conectado com sucesso!');
      // Clean query param
      window.history.replaceState({}, '', '/integrations');
    }
  }, [location]);

  const handleConnectYouTube = async () => {
    try {
      const token = await getToken();
      if (!token) {
        toast.error('Erro ao obter token de autenticação');
        return;
      }

      // Call yt-oauth-start edge function
      const response = await fetch(
        'https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/yt-oauth-start',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao iniciar OAuth do YouTube');
      }

      // Edge function redirects to Google OAuth
      // The response will be a 302 redirect, follow it
      if (response.redirected) {
        window.location.href = response.url;
      }
    } catch (error) {
      console.error('Error connecting YouTube:', error);
      toast.error('Erro ao conectar YouTube');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link to="/clip-lab" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="text-xl font-bold text-foreground">Cortaí</span>
            </Link>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">
                {user?.email}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:w-64 flex-shrink-0">
            <nav className="space-y-2">
              <Link
                to="/dashboard"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Play className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/projects"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Video className="w-5 h-5" />
                <span>Meus Projetos</span>
              </Link>
              <Link
                to="/settings"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <SettingsIcon className="w-5 h-5" />
                <span>Configurações</span>
              </Link>
              <Link
                to="/integrations"
                className="flex items-center space-x-3 px-3 py-2 rounded-md bg-primary/10 text-primary font-medium"
              >
                <Cable className="w-5 h-5" />
                <span>Integrações</span>
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 max-w-2xl">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Integrações
              </h1>
              <p className="text-muted-foreground">
                Conecte serviços externos para expandir funcionalidades
              </p>
            </div>

            <div className="space-y-6">
              {/* YouTube Integration Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-lg bg-red-500 flex items-center justify-center">
                        <Youtube className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <CardTitle>YouTube</CardTitle>
                        <CardDescription>
                          Publique vídeos automaticamente no YouTube
                        </CardDescription>
                      </div>
                    </div>
                    
                    {loading ? (
                      <Badge variant="outline">Carregando...</Badge>
                    ) : isConnected ? (
                      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Conectado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Não conectado
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {isConnected && account && (
                    <Alert>
                      <AlertDescription>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">
                              {account.channel_title || 'Canal do YouTube'}
                            </p>
                            {isExpired && (
                              <p className="text-xs text-destructive mt-1">
                                Token expirado - reconecte sua conta
                              </p>
                            )}
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-foreground">Recursos:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Upload automático de vídeos editados</li>
                      <li>Configuração de título e descrição</li>
                      <li>Seleção de privacidade (público, não listado, privado)</li>
                    </ul>
                  </div>

                  <Button 
                    onClick={handleConnectYouTube}
                    disabled={loading}
                    className="w-full"
                    variant={isConnected ? "outline" : "default"}
                  >
                    {loading ? 'Carregando...' : isConnected ? 'Reconectar YouTube' : 'Conectar YouTube'}
                  </Button>
                </CardContent>
              </Card>

              {/* More integrations coming soon */}
              <Card className="border-dashed">
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">
                    <Cable className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Mais integrações em breve</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Integrations;
