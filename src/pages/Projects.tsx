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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import NewProjectDialog from '@/components/projects/NewProjectDialog';
import { ProjectCardPro } from '@/components/projects/ProjectCardPro';
import { listProjects, deleteProject, updateProject, type Project } from '@/services/projects';
import { useToast } from '@/hooks/use-toast';

const Projects = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Project[]>([]);

  // Edit project state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete project state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      console.log('[Projects] Authenticated user:', user?.id, user?.email);
      const data = await listProjects();
      console.log('[Projects] Fetched projects:', data.length, 'items');
      console.log('[Projects] Project data:', data);
      setItems(data);
    } catch (err: unknown) {
      console.error('[Projects] Error fetching projects:', err);
      const message = err instanceof Error ? err.message : 'Tente novamente.';
      toast({ title: 'Erro ao carregar projetos', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Handle edit project
  const handleEditProject = (project: Project) => {
    setProjectToEdit(project);
    setNewTitle(project.title || '');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!projectToEdit) return;

    try {
      setIsUpdating(true);
      await updateProject(projectToEdit.id, { title: newTitle });

      // Update local state
      setItems(items.map(item =>
        item.id === projectToEdit.id
          ? { ...item, title: newTitle }
          : item
      ));

      toast({
        title: 'Projeto atualizado',
        description: 'O título do projeto foi atualizado com sucesso',
      });

      setEditDialogOpen(false);
      setProjectToEdit(null);
      setNewTitle('');
    } catch (error) {
      console.error('[Projects] Error updating project:', error);
      toast({
        title: 'Erro ao atualizar projeto',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle delete project
  const handleDeleteProject = (project: Project) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;

    try {
      setIsDeleting(true);
      await deleteProject(projectToDelete.id);

      // Update local state
      setItems(items.filter(item => item.id !== projectToDelete.id));

      toast({
        title: 'Projeto excluído',
        description: 'O projeto foi excluído com sucesso',
      });

      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('[Projects] Error deleting project:', error);
      toast({
        title: 'Erro ao excluir projeto',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
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
              <>
                {/* Header com contador e filtros */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">
                      {items.length} {items.length === 1 ? 'Projeto' : 'Projetos'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {items.filter(p => p.status === 'completed').length} concluídos, {' '}
                      {items.filter(p => p.status === 'active').length} em processamento
                    </p>
                  </div>
                </div>

                {/* Grid de projetos com cards visuais */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {items.map((project) => (
                    <ProjectCardPro
                      key={project.id}
                      project={project}
                      onEdit={handleEditProject}
                      onDelete={handleDeleteProject}
                    />
                  ))}
                </div>
              </>
            )}

            <NewProjectDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              onCreated={fetchProjects}
            />

            {/* Edit Project Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar Projeto</DialogTitle>
                  <DialogDescription>
                    Atualize o título do seu projeto
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título do Projeto</Label>
                    <Input
                      id="title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Digite o título do projeto"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setEditDialogOpen(false)}
                    disabled={isUpdating}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={isUpdating || !newTitle.trim()}
                  >
                    {isUpdating ? 'Salvando...' : 'Salvar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Project Confirmation */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Isso irá excluir permanentemente o projeto
                    {projectToDelete?.title && ` "${projectToDelete.title}"`} e todos os seus clips.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? 'Excluindo...' : 'Excluir'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Projects;
