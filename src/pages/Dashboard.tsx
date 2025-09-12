import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useUser, useAuth } from '@clerk/clerk-react';
import { LogOut, Play, Settings, Video, Plus } from 'lucide-react';
import { ClipCard } from '@/components/ClipCard';
import { NewProjectForm } from '@/components/NewProjectForm';
import { EmptyState } from '@/components/EmptyState';
import { enqueuePipeline, getJobStatus, Job } from '@/lib/jobs-api';
import { getUserJobs, saveUserJob, updateJobStatus } from '@/lib/storage';
import { getUsage, UsageDTO } from '@/lib/usage';
import { getAuthHeader } from '@/lib/auth-token';
import { useToast } from '@/hooks/use-toast';

const Dashboard = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [usage, setUsage] = useState<UsageDTO | null>(null);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load jobs and usage on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const loadData = async () => {
      try {
        // Load jobs from localStorage
        const userJobs = getUserJobs(user.id);
        setJobs(userJobs);
        
        // Load usage data
        const headers = await getAuthHeader(getToken);
        const usageData = await getUsage(headers);
        setUsage(usageData);
        
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
    try {
      const headers = await getAuthHeader(getToken);
      
      for (const job of activeJobs) {
        try {
          const status = await getJobStatus(job.id, async (opts?: any) => getToken({ template: 'supabase', ...(opts||{}) }));
          if (status.status !== job.status || status.progress !== job.progress) {
            updateJobStatus(user!.id, job.id, {
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
          console.error(`Failed to get status for job ${job.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to poll job statuses:', error);
    }
  };

  const handleCreateProject = async (youtubeUrl: string, neededMinutes: number, targetDuration: string) => {
    try {
      const result = await enqueuePipeline(
        youtubeUrl,
        neededMinutes,
        targetDuration,
        async () => await getToken({ template: 'supabase' })
      );
      
      const newJob: Job = {
        id: result.jobId || result.id,
        youtubeUrl,
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
        neededMinutes,
        targetDuration
      };
      
      // Save to localStorage
      saveUserJob(user!.id, newJob);
      
      // Update local state
      setJobs(prev => [newJob, ...prev]);
      
      toast({
        title: "Projeto criado",
        description: "Seu projeto foi criado e está na fila de processamento"
      });
    } catch (error: any) {
      console.error('Failed to create project:', error);
      toast({
        title: "Erro ao criar projeto",
        description: error.message || "Tente novamente",
        variant: "destructive"
      });
      throw error;
    }
  };

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
                {user?.emailAddresses[0]?.emailAddress}
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
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            <div className="mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-foreground mb-2">
                    Bem-vindo ao Cortaí!
                  </h1>
                  <p className="text-muted-foreground">
                    Transforme seus vídeos do YouTube em clipes virais para redes sociais
                  </p>
                </div>
                
                <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" />
                      Novo Projeto
                    </Button>
                  </DialogTrigger>
                  <NewProjectForm 
                    onSubmit={handleCreateProject}
                    onClose={() => setIsNewProjectOpen(false)}
                  />
                </Dialog>
              </div>
              
              {/* Usage Bar */}
              {usage && (
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Minutos Usados</span>
                      <span className="font-medium">
                        {usage.minutesUsed} / {usage.minutesQuota}
                      </span>
                    </div>
                    <Progress 
                      value={(usage.minutesUsed / usage.minutesQuota) * 100} 
                      className="h-2 mb-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Plano: {usage.plan}</span>
                      <span>{usage.remaining} minutos restantes</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Quick Stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Projetos Criados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{jobs.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Clipes Gerados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {jobs.filter(j => j.status === 'completed').length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Minutos Processados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage?.minutesUsed || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Jobs List */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Meus Projetos</h2>
              {jobs.length === 0 ? (
                <EmptyState onAction={() => setIsNewProjectOpen(true)} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {jobs.map((job) => (
                    <ClipCard key={job.id} job={job} />
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
