import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
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
  Youtube,
  Upload,
  Sparkles
} from 'lucide-react';
import { QuickCreate } from '@/components/QuickCreate';
import { StatCard, WorkflowCard, EmptyState } from '@/components/dashboard';
import { getJobStatus, Job } from '@/lib/jobs-api';
import { getUserJobs, updateJobStatus } from '@/lib/storage';
import { getUsage, UsageDTO } from '@/lib/usage';
import { getAuthHeader } from '@/lib/auth-token';

const Dashboard = () => {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [usage, setUsage] = useState<UsageDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          // Continue with other jobs even if one fails
        }
      }
    } catch (error) {
      console.error('Failed to poll job statuses:', error);
    }
  };

  const handleProjectCreated = (jobId: string) => {
    // Recarregar jobs do localStorage
    const updatedJobs = getUserJobs(user!.id);
    setJobs(updatedJobs);
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    const completedJobs = jobs.filter(j => j.status === 'completed');
    const totalClips = completedJobs.reduce((acc, job) => {
      // Assume 10 clips per job on average
      return acc + (job.result?.clips?.length || 10);
    }, 0);

    const minutesProcessed = usage?.minutesUsed || 0;
    const avgProcessingTime = minutesProcessed / (jobs.length || 1);

    // Calculate time saved (assume manual editing takes 10x longer)
    const timeSaved = minutesProcessed * 9; // 10x - 1x = 9x saved

    return {
      totalProjects: jobs.length,
      totalClips,
      minutesProcessed,
      timeSaved: Math.round(timeSaved),
      activeProjects: jobs.filter(j => j.status === 'active' || j.status === 'queued').length,
      completedProjects: completedJobs.length,
    };
  }, [jobs, usage]);

  // Recent projects (last 5)
  const recentProjects = useMemo(() => {
    return jobs
      .filter(job => job.createdAt) // Filtrar jobs sem createdAt
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [jobs]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link to="/clip-lab" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="text-xl font-bold text-foreground">Cortaí</span>
            </Link>

            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="hidden md:flex">
                {usage?.plan || 'Free'} Plan
              </Badge>
              <span className="text-sm text-muted-foreground hidden md:block">
                {user?.email}
              </span>
              <Button variant="ghost" size="icon" asChild>
                <Link to="/settings">
                  <Settings className="w-5 h-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:w-64 flex-shrink-0">
            <nav className="space-y-2 sticky top-24">
              <Link
                to="/dashboard"
                className="flex items-center space-x-3 px-3 py-2 rounded-md bg-primary/10 text-primary font-medium"
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
                <Settings className="w-5 h-5" />
                <span>Configurações</span>
              </Link>

              {/* Quick Actions */}
              <div className="pt-6 space-y-2">
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Ações Rápidas
                </p>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => navigate('/projects/new')}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Projeto
                </Button>
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
              </div>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 space-y-8">
            {/* Welcome Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl font-bold text-foreground">
                  Dashboard
                </h1>
                <Badge variant="secondary" className="hidden md:flex">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {metrics.activeProjects} ativos
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Acompanhe suas métricas e projetos em tempo real
              </p>
            </div>

            {/* Stats Cards - Cockpit Style */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Projetos Criados"
                value={metrics.totalProjects}
                icon={Video}
                description="Total de projetos"
                variant="default"
              />

              <StatCard
                title="Clipes Gerados"
                value={metrics.totalClips}
                icon={Sparkles}
                description={`${metrics.completedProjects} concluídos`}
                variant="primary"
                trend={{
                  value: 12,
                  label: 'vs. semana passada',
                  isPositive: true,
                }}
              />

              <StatCard
                title="Tempo Economizado"
                value={`${metrics.timeSaved}min`}
                icon={Clock}
                description="vs. edição manual"
                variant="success"
                trend={{
                  value: 900,
                  label: 'produtividade',
                  isPositive: true,
                }}
              />

              <StatCard
                title="Taxa de Conclusão"
                value={`${Math.round((metrics.completedProjects / (metrics.totalProjects || 1)) * 100)}%`}
                icon={TrendingUp}
                description="Projetos finalizados"
                variant="info"
              />
            </div>

            {/* Quick Create */}
            <Card className="border-2 border-dashed border-primary/30 bg-gradient-subtle">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Criar Novo Projeto
                </CardTitle>
                <CardDescription>
                  Cole uma URL do YouTube ou faça upload de um vídeo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QuickCreate
                  userId={user!.id}
                  getToken={getToken}
                  onProjectCreated={handleProjectCreated}
                />
              </CardContent>
            </Card>

            {/* Usage Bar */}
            {usage && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Uso do Plano</CardTitle>
                    <Button variant="link" size="sm" asChild>
                      <Link to="/billing">
                        Fazer Upgrade <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Minutos Processados</span>
                    <span className="font-medium">
                      {usage.minutesUsed} / {usage.minutesQuota} min
                    </span>
                  </div>
                  <Progress
                    value={(usage.minutesUsed / usage.minutesQuota) * 100}
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Plano {usage.plan}</span>
                    <span>{usage.remaining} minutos restantes</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Projects */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Projetos Recentes</h2>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/projects">
                    Ver Todos <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>

              {recentProjects.length === 0 ? (
                <EmptyState
                  icon={Video}
                  title="Nenhum projeto ainda"
                  description="Comece criando seu primeiro projeto e transforme vídeos em clipes virais!"
                  action={{
                    label: 'Criar Primeiro Projeto',
                    onClick: () => navigate('/projects/new'),
                  }}
                  secondaryAction={{
                    label: 'Ver Demonstração',
                    onClick: () => {/* TODO: Open demo modal */},
                  }}
                />
              ) : (
                <div className="space-y-4">
                  {recentProjects.map((job) => (
                    <WorkflowCard
                      key={job.id}
                      id={job.id}
                      title={job.youtubeUrl || 'Projeto sem título'}
                      status={job.status}
                      progress={job.progress || 0}
                      clipsGenerated={job.result?.clips?.length || 0}
                      totalClips={10}
                      createdAt={job.createdAt}
                      onView={() => navigate(`/projects/${job.id}`)}
                      onDownload={() => {
                        // TODO: Download all clips
                        console.log('Download all clips for job:', job.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
