import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Play, Settings, Video, Plus, CheckCircle2, Youtube, Sparkles, TrendingUp, User, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import NewProjectDialog from '@/components/projects/NewProjectDialog';
import { listProjects, type Project } from '@/services/projects';
import { useToast } from '@/hooks/use-toast';

const Projects = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Project[]>([]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      console.log('[Projects] Authenticated user:', user?.id, user?.email);
      const data = await listProjects();
      console.log('[Projects] Fetched projects:', data.length, 'items');
      console.log('[Projects] Project data:', data);
      setItems(data);
    } catch (err: any) {
      console.error('[Projects] Error fetching projects:', err);
      toast({ title: 'Erro ao carregar projetos', description: err?.message ?? 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="text-xl font-bold text-foreground">Cortaí</span>
            </div>

            <div className="flex items-center space-x-4">
              {/* User Menu Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm text-foreground hidden sm:inline">{user?.email}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="w-4 h-4 mr-2" />
                    Perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="w-4 h-4 mr-2" />
                    Configurações
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Plano Atual
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                className="flex items-center justify-between px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Play className="w-5 h-5" />
                  <span>Dashboard</span>
                </div>
              </Link>
              <Link
                to="/projects"
                className="flex items-center justify-between px-3 py-2 rounded-md bg-primary/10 text-primary font-medium"
              >
                <div className="flex items-center space-x-3">
                  <Video className="w-5 h-5 fill-current" />
                  <span>Meus Projetos</span>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {items.length}
                </Badge>
              </Link>
              <Link
                to="/settings"
                className="flex items-center justify-between px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Settings className="w-5 h-5" />
                  <span>Configurações</span>
                </div>
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  Meus Projetos
                </h1>
                <p className="text-muted-foreground">
                  Gerencie todos os seus projetos de conversão de vídeos
                </p>
              </div>
              <Button className="flex items-center space-x-2" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4" />
                <span>Novo Projeto</span>
              </Button>
            </div>

            {loading ? (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <CardDescription>Carregando projetos...</CardDescription>
                </CardContent>
              </Card>
            ) : items.length === 0 ? (
              <div className="max-w-3xl mx-auto">
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Hero Section */}
                    <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 sm:p-12 text-center">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-primary mb-6">
                        <Video className="w-10 h-10 text-white" />
                      </div>
                      <h2 className="text-3xl font-bold text-foreground mb-3">
                        Transforme Vídeos em Clipes Virais
                      </h2>
                      <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
                        Comece criando seu primeiro projeto e descubra como é fácil gerar conteúdo engajador para suas redes sociais
                      </p>
                      <Button
                        size="lg"
                        className="text-base px-8 shadow-lg hover:shadow-xl transition-all"
                        onClick={() => setDialogOpen(true)}
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        Criar Primeiro Projeto
                      </Button>
                    </div>

                    {/* Benefits Section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 sm:p-12 bg-background">
                      <div className="space-y-3">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                          <Youtube className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground">Cole um link do YouTube</h3>
                        <p className="text-sm text-muted-foreground">
                          Escolha qualquer vídeo do YouTube e nossa IA identifica os melhores momentos automaticamente
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                          <Sparkles className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground">Gere até 8 clipes virais</h3>
                        <p className="text-sm text-muted-foreground">
                          Receba clipes prontos com legendas animadas, transcrição e sugestões de títulos e hashtags
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                          <TrendingUp className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground">Publique no TikTok & Instagram</h3>
                        <p className="text-sm text-muted-foreground">
                          Compartilhe diretamente para suas redes ou baixe os vídeos em formato vertical otimizado
                        </p>
                      </div>
                    </div>

                    {/* Onboarding Checklist */}
                    <div className="border-t border-border p-8 sm:p-12 bg-muted/30">
                      <h3 className="font-semibold text-foreground mb-4 flex items-center">
                        <CheckCircle2 className="w-5 h-5 mr-2 text-primary" />
                        Primeiros Passos
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3 text-sm">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                            1
                          </div>
                          <p className="text-muted-foreground pt-0.5">
                            <span className="font-medium text-foreground">Criar seu primeiro projeto</span> — Cole um link do YouTube para começar
                          </p>
                        </div>
                        <div className="flex items-start space-x-3 text-sm">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-xs">
                            2
                          </div>
                          <p className="text-muted-foreground pt-0.5">
                            Aguarde a IA processar e gerar os clipes (leva ~2-3 minutos)
                          </p>
                        </div>
                        <div className="flex items-start space-x-3 text-sm">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-xs">
                            3
                          </div>
                          <p className="text-muted-foreground pt-0.5">
                            Baixe ou publique seus clipes direto nas redes sociais
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`}>
                    <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer hover:border-primary/50 h-full">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Play className="w-4 h-4 text-primary" />
                          {p.source === 'youtube' ? 'Vídeo do YouTube' :
                           p.file_name || p.title || 'Projeto sem título'}
                        </CardTitle>
                        <CardDescription className="truncate">
                          {p.youtube_url || p.storage_path || 'Sem origem'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <Badge variant={p.status === 'completed' ? 'default' : 'secondary'}>
                            {p.status === 'completed' ? '✅ Concluído' :
                             p.status === 'active' ? '🚀 Processando' :
                             p.status === 'failed' ? '⚠️ Erro' : '⏰ Na fila'}
                          </Badge>
                          {p.progress !== null && p.progress > 0 && (
                            <span className="text-xs">({p.progress}%)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleString('pt-BR')}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            <NewProjectDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              onCreated={fetchProjects}
            />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Projects;