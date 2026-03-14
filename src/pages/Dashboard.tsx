import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  Play,
  Settings,
  Video,
  Clock,
  TrendingUp,
  Zap,
  Plus,
  ArrowRight,
  Sparkles,
  Shield
} from 'lucide-react';
import { QuickCreate } from '@/components/QuickCreate';
import { StatCard, WorkflowCard, EmptyState } from '@/components/dashboard';
import { TiltCard, MouseSpotlight } from '@/components/landing';
import { getJobStatus, Job } from '@/lib/jobs-api';
import { deleteUserJob, getUserJobs, updateJobStatus } from '@/lib/storage';
import { getUsage, UsageDTO } from '@/lib/usage';
import { getAuthHeader } from '@/lib/auth-token';
import { createProjectTitle, extractVideoId, getYouTubeMetadata } from '@/lib/youtube-metadata';
import { deleteProject } from '@/services/projects';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isAdminEmail } from '@/lib/admin';

const sidebarVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const sidebarItemVariants = {
  hidden: { opacity: 0, x: -15, rotateY: -10 },
  visible: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

const statsContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const statsItemVariants = {
  hidden: { opacity: 0, y: 30, rotateX: 8 },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const Dashboard = () => {
  const { user, getToken } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [usage, setUsage] = useState<UsageDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [projectMetadata, setProjectMetadata] = useState<Record<string, {
    title?: string;
    thumbnailUrl?: string;
  }>>({});

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // Load jobs and usage on mount
  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      try {
        // Load jobs from localStorage (sempre funciona, mesmo offline)
        const userJobs = getUserJobs(user.id);
        setJobs(userJobs);

        // Try to load usage data (pode falhar se API estiver offline)
        try {
          const headers = await getAuthHeader(getToken);
          const usageData = await getUsage(headers);
          setUsage(usageData);
        } catch (usageError) {
          console.warn('Failed to load usage data:', usageError);
          // Set default usage if API fails
          setUsage({
            minutesUsed: 0,
            minutesQuota: 10,
            remaining: 10,
            plan: 'Free',
          });
        }

        // Poll for job status updates for active jobs
        const activeJobs = userJobs.filter(job =>
          job.status === 'queued' || job.status === 'active'
        );

        if (activeJobs.length > 0) {
          pollJobStatuses(activeJobs);
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user?.id, getToken]);

  const pollJobStatuses = async (activeJobs: Job[]) => {
    if (!user?.id) return;

    try {
      for (const job of activeJobs) {
        try {
          const status = await getJobStatus(job.id, getToken);
          if (status && (status.status !== job.status || status.progress !== job.progress)) {
            updateJobStatus(user.id, job.id, {
              status: status.status,
              progress: status.progress,
              error: status.error
            });

            // Update local state
            setJobs(prev => prev.map(j =>
              j.id === job.id ? { ...j, ...status } : j
            ));
          }
        } catch (error) {
          console.warn(`Failed to get status for job ${job.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to poll job statuses:', error);
    }
  };

  const handleProjectCreated = (jobId: string) => {
    const updatedJobs = getUserJobs(user!.id);
    setJobs(updatedJobs);
  };

  const handleDeleteProject = (job: Job) => {
    setJobToDelete(job);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!jobToDelete || !user?.id) return;

    try {
      setIsDeleting(true);

      setJobs((prev) => prev.filter((item) => item.id !== jobToDelete.id));
      setProjectMetadata((prev) => {
        const next = { ...prev };
        delete next[jobToDelete.id];
        return next;
      });
      deleteUserJob(user.id, jobToDelete.id);

      await deleteProject(jobToDelete.id);
      toast({
        title: 'Vídeo excluído',
        description: 'O vídeo foi removido com sucesso.',
      });
    } catch (error) {
      console.warn('Failed to delete project on backend:', error);
      toast({
        title: 'Removido localmente',
        description: 'Não foi possível excluir no backend agora, mas saiu do seu dashboard.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setJobToDelete(null);
    }
  };

  const metrics = useMemo(() => {
    const completedJobs = jobs.filter(j => j.status === 'completed');
    const totalClips = completedJobs.reduce((acc, job) => {
      return acc + (job.result?.clips?.length || 10);
    }, 0);

    const minutesProcessed = usage?.minutesUsed || 0;

    const timeSaved = minutesProcessed * 9;

    return {
      totalProjects: jobs.length,
      totalClips,
      minutesProcessed,
      timeSaved: Math.round(timeSaved),
      activeProjects: jobs.filter(j => j.status === 'active' || j.status === 'queued').length,
      completedProjects: completedJobs.length,
    };
  }, [jobs, usage]);

  const recentProjects = useMemo(() => {
    return jobs
      .filter(job => job.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [jobs]);

  useEffect(() => {
    let cancelled = false;

    const projectsWithoutMetadata = recentProjects.filter((job) => {
      if (!job.youtubeUrl || job.youtubeUrl.startsWith('upload://')) {
        return false;
      }

      if (projectMetadata[job.id]) {
        return false;
      }

      const hasTitle = Boolean(job.result?.metadata?.title || projectMetadata[job.id]?.title);
      const hasThumbnail = Boolean(
        job.result?.thumbnailUrl ||
        job.result?.metadata?.thumbnail ||
        projectMetadata[job.id]?.thumbnailUrl
      );

      return !hasTitle || !hasThumbnail;
    });

    if (projectsWithoutMetadata.length === 0) {
      return;
    }

    const loadMissingMetadata = async () => {
      const metadataEntries = await Promise.all(
        projectsWithoutMetadata.map(async (job) => {
          if (!job.youtubeUrl) {
            return null;
          }

          try {
            const metadata = await getYouTubeMetadata(job.youtubeUrl);
            if (!metadata.title && !metadata.thumbnailUrl) {
              return [job.id, {}] as const;
            }

            return [
              job.id,
              {
                title: metadata.title,
                thumbnailUrl: metadata.thumbnailUrl,
              },
            ] as const;
          } catch {
            return [job.id, {}] as const;
          }
        })
      );

      if (cancelled) {
        return;
      }

      const validEntries = metadataEntries.filter(
        (entry): entry is readonly [string, { title?: string; thumbnailUrl?: string }] =>
          entry !== null
      );

      if (validEntries.length === 0) {
        return;
      }

      setProjectMetadata((prev) => {
        const merged = { ...prev };
        for (const [jobId, metadata] of validEntries) {
          merged[jobId] = {
            title: metadata.title || prev[jobId]?.title,
            thumbnailUrl: metadata.thumbnailUrl || prev[jobId]?.thumbnailUrl,
          };
        }
        return merged;
      });
    };

    loadMissingMetadata();

    return () => {
      cancelled = true;
    };
  }, [recentProjects, projectMetadata]);

  const getProjectThumbnail = (job: Job) => {
    const thumbnailFromJob =
      job.result?.thumbnailUrl ||
      job.result?.metadata?.thumbnail ||
      job.result?.clips?.find((clip) => clip.thumbnailUrl)?.thumbnailUrl;

    if (thumbnailFromJob) {
      return thumbnailFromJob;
    }

    if (projectMetadata[job.id]?.thumbnailUrl) {
      return projectMetadata[job.id].thumbnailUrl;
    }

    if (!job.youtubeUrl || job.youtubeUrl.startsWith('upload://')) {
      return undefined;
    }

    const videoId = extractVideoId(job.youtubeUrl);
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined;
  };

  const getProjectName = (job: Job) => {
    const metadataTitle = job.result?.metadata?.title?.trim();
    if (metadataTitle) {
      return metadataTitle;
    }

    const cachedTitle = projectMetadata[job.id]?.title?.trim();
    if (cachedTitle) {
      return cachedTitle;
    }

    const firstClipTitle = job.result?.clips?.[0]?.title?.trim();
    if (firstClipTitle) {
      return firstClipTitle;
    }

    if (job.fileName) {
      return job.fileName;
    }

    if (job.youtubeUrl?.startsWith('upload://')) {
      return job.youtubeUrl.replace('upload://', '') || `Projeto #${job.id.slice(0, 8)}`;
    }

    if (job.youtubeUrl) {
      const fallbackTitle = createProjectTitle(job.youtubeUrl);
      if (fallbackTitle !== 'Novo Projeto') {
        return fallbackTitle;
      }
    }

    return `Projeto #${job.id.slice(0, 8)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="rounded-full h-16 w-16 border-b-2 border-primary"
        />
      </div>
    );
  }

  const navItems = [
    { to: '/dashboard', icon: Play, label: 'Dashboard', active: true },
    { to: '/projects', icon: Video, label: 'Meus Projetos', active: false },
    { to: '/settings', icon: Settings, label: 'Configurações', active: false },
  ];

  if (isAdminEmail(user?.email)) {
    navItems.push({ to: '/admin', icon: Shield, label: 'Admin', active: false });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with glassmorphism */}
      <header className="border-b border-border glass sticky top-0 z-50">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link to="/clip-lab" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center"
              >
                <span className="text-white font-bold text-sm">C</span>
              </motion.div>
              <span className="text-xl font-bold text-foreground">Cortaí</span>
            </Link>

            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="hidden md:flex">
                {usage?.plan || 'Free'} Plan
              </Badge>
              <span className="text-sm text-muted-foreground hidden md:block">
                {user?.email}
              </span>
              <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.3 }}>
                <Button variant="ghost" size="icon" asChild>
                  <Link to="/settings">
                    <Settings className="w-5 h-5" />
                  </Link>
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar with 3D staggered entrance */}
          <aside className="lg:w-64 flex-shrink-0">
            <motion.nav
              variants={sidebarVariants}
              initial="hidden"
              animate="visible"
              className="space-y-2 sticky top-24"
              style={{ perspective: 600 }}
            >
              {navItems.map((item) => (
                <motion.div key={item.to} variants={sidebarItemVariants}>
                  <Link
                    to={item.to}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-300 ${
                      item.active
                        ? 'bg-primary/10 text-primary font-medium shadow-[inset_3px_0_0_hsl(var(--primary)),0_0_15px_hsl(var(--primary)/0.15)]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                </motion.div>
              ))}

              <motion.div variants={sidebarItemVariants} className="pt-6 space-y-2">
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Ações Rápidas
                </p>
                <motion.div whileHover={{ scale: 1.02, x: 3 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate('/projects/new')}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Novo vídeo
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02, x: 3 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    asChild
                  >
                    <Link to="/integrations">
                      <Zap className="w-4 h-4 mr-2" />
                      Integrações
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>
            </motion.nav>
          </aside>

          {/* Main Content Area with MouseSpotlight */}
          <MouseSpotlight className="flex-1">
            <main className="space-y-6">
              {/* Page Title */}
              <motion.div
                initial={{ opacity: 0, y: -10, rotateX: 10 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ perspective: 800 }}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div>
                  <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
                  <p className="text-sm text-muted-foreground">Ação principal em destaque para iniciar um novo vídeo.</p>
                </div>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
                >
                  <Badge variant="secondary" className="w-fit animate-glow-pulse">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {metrics.activeProjects} ativos
                  </Badge>
                </motion.div>
              </motion.div>

              {/* Quick Create + Usage Grid */}
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <motion.div
                  initial={{ opacity: 0, y: 30, rotateX: 5 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  style={{ perspective: 1000 }}
                >
                  <TiltCard tiltDegree={4} glare>
                    <Card className="border border-primary/25 glass-card glass-card-hover shadow-card">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Plus className="w-5 h-5" />
                              Criar Novo Vídeo
                            </CardTitle>
                            <CardDescription>
                              Cole o link e gere em 1 clique. Ajustes rápidos opcionais.
                            </CardDescription>
                          </div>
                          <Badge variant="outline" className="hidden md:flex">
                            Fluxo 1-clique
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <QuickCreate
                          userId={user!.id}
                          getToken={getToken}
                          onProjectCreated={handleProjectCreated}
                          variant="compact"
                        />
                      </CardContent>
                    </Card>
                  </TiltCard>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 30, rotateY: 10 }}
                  animate={{ opacity: 1, x: 0, rotateY: 0 }}
                  transition={{ delay: 0.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  style={{ perspective: 1000 }}
                >
                  <TiltCard tiltDegree={5} glare>
                    <Card className="h-fit border border-white/10 glass-card glass-card-hover shadow-card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Uso do Plano</CardTitle>
                        <CardDescription>Monitoramento contínuo da sua capacidade.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {usage ? (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Minutos Processados</span>
                              <span className="font-medium">
                                {usage.minutesUsed} / {usage.minutesQuota} min
                              </span>
                            </div>
                            <Progress
                              value={(usage.minutesUsed / Math.max(usage.minutesQuota, 1)) * 100}
                              className="h-2"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Plano {usage.plan}</span>
                              <span>{usage.remaining} minutos restantes</span>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Não foi possível carregar o uso agora.
                          </p>
                        )}
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Button variant="outline" className="w-full" asChild>
                            <Link to="/billing">
                              Fazer Upgrade <ArrowRight className="w-4 h-4 ml-1" />
                            </Link>
                          </Button>
                        </motion.div>
                      </CardContent>
                    </Card>
                  </TiltCard>
                </motion.div>
              </section>

              {/* Stats Cards with staggered 3D entrance */}
              <motion.section
                variants={statsContainerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
                style={{ perspective: 1000 }}
              >
                <motion.div variants={statsItemVariants}>
                  <StatCard
                    title="Projetos Criados"
                    value={metrics.totalProjects}
                    icon={Video}
                    description="Total da sua biblioteca"
                    variant="default"
                  />
                </motion.div>
                <motion.div variants={statsItemVariants}>
                  <StatCard
                    title="Clipes Gerados"
                    value={metrics.totalClips}
                    icon={Sparkles}
                    description={`${metrics.completedProjects} projetos concluídos`}
                    variant="primary"
                  />
                </motion.div>
                <motion.div variants={statsItemVariants}>
                  <StatCard
                    title="Tempo Economizado"
                    value={`${metrics.timeSaved}min`}
                    icon={Clock}
                    description="vs. edição manual"
                    variant="success"
                  />
                </motion.div>
                <motion.div variants={statsItemVariants}>
                  <StatCard
                    title="Taxa de Conclusão"
                    value={`${Math.round((metrics.completedProjects / (metrics.totalProjects || 1)) * 100)}%`}
                    icon={TrendingUp}
                    description="Projetos finalizados"
                    variant="info"
                  />
                </motion.div>
              </motion.section>

              {/* Recent Projects */}
              <section>
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="mb-4 flex items-center justify-between"
                >
                  <h2 className="text-xl font-semibold">Projetos Recentes</h2>
                  <motion.div whileHover={{ scale: 1.05, x: 3 }} whileTap={{ scale: 0.95 }}>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/projects">
                        Ver Todos <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                    </Button>
                  </motion.div>
                </motion.div>

                {recentProjects.length === 0 ? (
                  <Card className="glass-card">
                    <CardContent className="p-8">
                      <EmptyState
                        icon={Video}
                        title="Nenhum projeto ainda"
                        description="Comece criando seu primeiro vídeo e acompanhe tudo por aqui."
                        action={{
                          label: 'Criar Primeiro Vídeo',
                          onClick: () => navigate('/projects/new'),
                        }}
                        secondaryAction={{
                          label: 'Ir para projetos',
                          onClick: () => navigate('/projects'),
                        }}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 2xl:grid-cols-2" style={{ perspective: 1000 }}>
                    {recentProjects.map((job, index) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 40, rotateX: 8 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0 }}
                        transition={{
                          delay: 0.7 + index * 0.08,
                          duration: 0.6,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <WorkflowCard
                          id={job.id}
                          title={getProjectName(job)}
                          thumbnailUrl={getProjectThumbnail(job)}
                          status={job.status === 'waiting-children' ? 'active' : job.status}
                          progress={job.progress || 0}
                          clipsGenerated={job.result?.clips?.length || 0}
                          totalClips={10}
                          createdAt={job.createdAt}
                          onView={() => navigate(`/projects/${job.id}`)}
                          onDownload={() => {
                            console.log('Download all clips for job:', job.id);
                          }}
                          onDelete={() => handleDeleteProject(job)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            </main>
          </MouseSpotlight>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vídeo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este vídeo do dashboard? Esta ação não pode ser desfeita.
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
    </div>
  );
};

export default Dashboard;
