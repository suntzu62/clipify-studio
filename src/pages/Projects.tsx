import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Play, Settings, Video, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
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
      const data = await listProjects();
      setItems(data);
    } catch (err: any) {
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
                className="flex items-center space-x-3 px-3 py-2 rounded-md bg-primary/10 text-primary font-medium"
              >
                <Video className="w-5 h-5" />
                <span>Meus Projetos</span>
              </Link>
              <Link
                to="/settings"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Settings className="w-5 h-5" />
                <span>Configurações</span>
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
              <Card className="text-center py-12">
                <CardContent>
                  <Video className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <CardTitle className="mb-2">Nenhum projeto ainda</CardTitle>
                  <CardDescription className="mb-6">
                    Comece criando seu primeiro projeto para transformar vídeos do YouTube em clipes virais
                  </CardDescription>
                  <Button className="flex items-center space-x-2 mx-auto" onClick={() => setDialogOpen(true)}>
                    <Plus className="w-4 h-4" />
                    <span>Criar Primeiro Projeto</span>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((p) => (
                  <Card key={p.id}>
                    <CardHeader>
                      <CardTitle className="text-base">{p.title || 'Projeto sem título'}</CardTitle>
                      <CardDescription className="truncate">{p.youtube_url}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground">Status: {p.status}</div>
                      <div className="text-xs text-muted-foreground mt-1">Criado em {new Date(p.created_at).toLocaleString('pt-BR')}</div>
                    </CardContent>
                  </Card>
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