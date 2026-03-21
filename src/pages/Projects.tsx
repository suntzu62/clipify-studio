import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { LogOut, Play, Settings, Video, Plus, CheckCircle2, Youtube, Sparkles, TrendingUp, User, ChevronDown, Loader2 } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import NewProjectDialog from '@/components/projects/NewProjectDialog';
import { ProjectCardPro } from '@/components/projects/ProjectCardPro';
import { listProjects, deleteProject, updateProject, type Project } from '@/services/projects';
import { getJobStatus } from '@/lib/jobs-api';
import { useToast } from '@/hooks/use-toast';
import { MouseSpotlight } from '@/components/landing';

/* ── Framer variants ── */
const sidebarVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const sidebarItemVariants = {
  hidden: { opacity: 0, x: -15, rotateY: -10 },
  visible: { opacity: 1, x: 0, rotateY: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
};

const gridContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const gridItemVariants = {
  hidden: { opacity: 0, y: 40, rotateX: 8 },
  visible: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
};

const benefitVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const benefitItemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 20 } },
};

const stepVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};
const stepItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 18 } },
};

const Projects = () => {
  const { user, getToken } = useAuth();
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

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[Projects] Authenticated user:', user?.id, user?.email);
      const data = await listProjects(user?.id);
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
  }, [toast, user?.email, user?.id]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch real titles from individual job endpoints (same approach as Dashboard)
  useEffect(() => {
    if (items.length === 0 || loading) return;

    const jobsMissingTitles = items.filter(
      (p) => !p.display_title || p.display_title.startsWith('YouTube ')
    );

    if (jobsMissingTitles.length === 0) return;

    let cancelled = false;

    const fetchTitles = async () => {
      console.log('[Projects] Fetching titles for', jobsMissingTitles.length, 'jobs via individual endpoints');
      await Promise.all(
        jobsMissingTitles.slice(0, 20).map(async (project) => {
          try {
            const status = await getJobStatus(project.id, getToken);
            const backendTitle = (status as any)?.display_title;
            if (backendTitle && !cancelled) {
              console.log('[Projects] Got title for', project.id, ':', backendTitle);
              setItems((prev) =>
                prev.map((p) =>
                  p.id === project.id
                    ? { ...p, title: backendTitle, display_title: backendTitle }
                    : p
                )
              );
            }
          } catch {
            // ignore - title fetch is best-effort
          }
        })
      );
    };

    fetchTitles();

    return () => {
      cancelled = true;
    };
  }, [items.length, loading, getToken]); // only re-run when items count changes

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
      {/* Header — glass */}
      <header className="border-b border-white/10 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link to="/clip-lab" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center"
              >
                <span className="text-white font-bold text-sm">C</span>
              </motion.div>
              <span className="text-xl font-bold text-foreground">Cortaí</span>
            </Link>

            <div className="flex items-center space-x-4">
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
          {/* Sidebar — 3D staggered */}
          <aside className="lg:w-64 flex-shrink-0">
            <motion.nav
              className="space-y-2"
              style={{ perspective: 600 }}
              variants={sidebarVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={sidebarItemVariants}>
                <Link
                  to="/dashboard"
                  className="flex items-center justify-between px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Play className="w-5 h-5" />
                    <span>Dashboard</span>
                  </div>
                </Link>
              </motion.div>
              <motion.div variants={sidebarItemVariants}>
                <Link
                  to="/projects"
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-primary/10 text-primary font-medium shadow-[0_0_15px_-3px] shadow-primary/20"
                >
                  <div className="flex items-center space-x-3">
                    <Video className="w-5 h-5 fill-current" />
                    <span>Meus Projetos</span>
                  </div>
                  <Badge variant="secondary" className="ml-auto">
                    {items.length}
                  </Badge>
                </Link>
              </motion.div>
              <motion.div variants={sidebarItemVariants}>
                <Link
                  to="/settings"
                  className="flex items-center justify-between px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Settings className="w-5 h-5" />
                    <span>Configurações</span>
                  </div>
                </Link>
              </motion.div>
            </motion.nav>
          </aside>

          {/* Main Content — MouseSpotlight */}
          <MouseSpotlight className="flex-1">
            {/* Page header — 3D entrance */}
            <motion.div
              className="flex items-center justify-between mb-8"
              initial={{ opacity: 0, y: 20, rotateX: 10 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ type: 'spring', stiffness: 180, damping: 20 }}
              style={{ perspective: 800 }}
            >
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  Meus Projetos
                </h1>
                <p className="text-muted-foreground">
                  Gerencie todos os seus projetos de conversão de vídeos
                </p>
              </div>
              <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
                <Button className="flex items-center space-x-2 btn-premium" onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4" />
                  <span>Novo video</span>
                </Button>
              </motion.div>
            </motion.div>

            {loading ? (
              <div className="space-y-6">
                {/* Skeleton header */}
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                </div>
                {/* Skeleton project cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-white/10 overflow-hidden">
                      <Skeleton className="h-40 w-full" />
                      <div className="p-4 space-y-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-16 rounded-full" />
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : items.length === 0 ? (
              <motion.div
                className="max-w-3xl mx-auto"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 160, damping: 20, delay: 0.1 }}
              >
                <Card className="overflow-hidden glass-card border-white/10">
                  <CardContent className="p-0">
                    {/* Hero Section */}
                    <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 sm:p-12 text-center overflow-hidden">
                      <div className="spotlight absolute inset-0 pointer-events-none" />
                      <motion.div
                        className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-primary mb-6 animate-float animate-glow-pulse"
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
                      >
                        <Video className="w-10 h-10 text-white" />
                      </motion.div>
                      <motion.h2
                        className="text-3xl font-bold text-foreground mb-3"
                        initial={{ opacity: 0, y: 15, rotateX: 8 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        style={{ perspective: 600 }}
                      >
                        Transforme Vídeos em Clipes Virais
                      </motion.h2>
                      <motion.p
                        className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                      >
                        Comece criando seu primeiro projeto e descubra como é fácil gerar conteúdo engajador para suas redes sociais
                      </motion.p>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          size="lg"
                          className="text-base px-8 shadow-lg hover:shadow-xl transition-all btn-premium"
                          onClick={() => setDialogOpen(true)}
                        >
                          <Plus className="w-5 h-5 mr-2" />
                          Criar Primeiro Projeto
                        </Button>
                      </motion.div>
                    </div>

                    {/* Benefits Section — staggered */}
                    <motion.div
                      className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 sm:p-12 bg-background"
                      variants={benefitVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, amount: 0.3 }}
                    >
                      {[
                        { icon: Youtube, title: 'Cole um link do YouTube', desc: 'Escolha qualquer vídeo do YouTube e nossa IA identifica os melhores momentos automaticamente' },
                        { icon: Sparkles, title: 'Gere até 8 clipes virais', desc: 'Receba clipes prontos com legendas animadas, transcrição e sugestões de títulos e hashtags' },
                        { icon: TrendingUp, title: 'Publique no TikTok & Instagram', desc: 'Compartilhe diretamente para suas redes ou baixe os vídeos em formato vertical otimizado' },
                      ].map((b) => (
                        <motion.div key={b.title} variants={benefitItemVariants} className="space-y-3">
                          <motion.div
                            className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10"
                            whileHover={{ rotate: [0, -12, 12, 0], scale: 1.15 }}
                            transition={{ duration: 0.4 }}
                          >
                            <b.icon className="w-6 h-6 text-primary" />
                          </motion.div>
                          <h3 className="font-semibold text-foreground">{b.title}</h3>
                          <p className="text-sm text-muted-foreground">{b.desc}</p>
                        </motion.div>
                      ))}
                    </motion.div>

                    {/* Onboarding Checklist — staggered */}
                    <div className="border-t border-white/10 p-8 sm:p-12 bg-muted/30">
                      <h3 className="font-semibold text-foreground mb-4 flex items-center">
                        <CheckCircle2 className="w-5 h-5 mr-2 text-primary" />
                        Primeiros Passos
                      </h3>
                      <motion.div
                        className="space-y-3"
                        variants={stepVariants}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.3 }}
                      >
                        {[
                          { n: '1', highlight: true, text: <><span className="font-medium text-foreground">Criar seu primeiro projeto</span> — Cole um link do YouTube para começar</> },
                          { n: '2', highlight: false, text: 'Aguarde a IA processar e gerar os clipes (leva ~2-3 minutos)' },
                          { n: '3', highlight: false, text: 'Baixe ou publique seus clipes direto nas redes sociais' },
                        ].map((s) => (
                          <motion.div key={s.n} variants={stepItemVariants} className="flex items-start space-x-3 text-sm">
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full ${s.highlight ? 'bg-primary/10' : 'bg-muted'} flex items-center justify-center ${s.highlight ? 'text-primary' : 'text-muted-foreground'} font-semibold text-xs`}>
                              {s.n}
                            </div>
                            <p className="text-muted-foreground pt-0.5">{s.text}</p>
                          </motion.div>
                        ))}
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <>
                {/* Header com contador */}
                <motion.div
                  className="flex items-center justify-between mb-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.4 }}
                >
                  <div>
                    <h2 className="text-xl font-bold">
                      {items.length} {items.length === 1 ? 'Projeto' : 'Projetos'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {items.filter(p => p.status === 'completed').length} concluídos, {' '}
                      {items.filter(p => p.status === 'active' || p.status === 'queued').length} em processamento
                    </p>
                  </div>
                </motion.div>

                {/* Grid — 3D staggered perspective */}
                <motion.div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                  style={{ perspective: 1200 }}
                  variants={gridContainerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {items.map((project) => (
                    <motion.div key={project.id} variants={gridItemVariants}>
                      <ProjectCardPro
                        project={project}
                        onEdit={handleEditProject}
                        onDelete={handleDeleteProject}
                      />
                    </motion.div>
                  ))}
                </motion.div>
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
          </MouseSpotlight>
        </div>
      </div>
    </div>
  );
};

export default Projects;
