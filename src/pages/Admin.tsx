import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/glass-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Shield, ArrowLeft, Users, Briefcase, DollarSign, Server,
  BarChart3, UserPlus, Clapperboard, Activity, AlertTriangle,
  TrendingUp, Search, RefreshCw, Loader2, CheckCircle2, XCircle,
  Clock, Database, Cpu, Wifi, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api-client';
import { MouseSpotlight, TiltCard } from '@/components/landing';
import { AnimatedCounter } from '@/components/dashboard';
import { cn } from '@/lib/utils';

/* ── Framer variants ── */
const headerVariants = {
  hidden: { opacity: 0, y: 25, rotateX: 12 },
  visible: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 180, damping: 20 } },
};
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 30, rotateX: 8 },
  visible: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
};

/* ── Types ── */
interface AdminStats {
  totalUsers: number;
  newUsers7d: number;
  totalJobs: number;
  activeJobs: number;
  failedJobs: number;
  totalClips: number;
  paidSubscribers: number;
  mrr: number;
  queue: { waiting: number; active: number; completed: number; failed: number; total: number };
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  plan_id: string | null;
  sub_status: string | null;
}

interface AdminJob {
  id: string;
  user_id: string;
  user_email: string;
  source_type: string;
  youtube_url: string | null;
  status: string;
  progress: number | null;
  error: string | null;
  current_step: string | null;
  created_at: string;
  title: string | null;
}

interface AdminPayment {
  id: string;
  user_id: string;
  user_email: string;
  plan_id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
}

interface SystemHealth {
  database: { status: string; latencyMs?: number; message?: string };
  redis: { status: string; latencyMs?: number; message?: string };
  queue: { waiting: number; active: number; completed: number; failed: number; total: number };
  process: { uptimeSeconds: number; memoryMb: { rss: number; heapUsed: number; heapTotal: number }; nodeEnv: string; nodeVersion: string };
}

/* ── Helper components ── */

const StatusBadge = ({ status }: { status: string }) => {
  const s = status.toLowerCase();
  const config: Record<string, { label: string; className: string }> = {
    active: { label: 'Ativo', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    processing: { label: 'Processando', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    completed: { label: 'Concluido', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    failed: { label: 'Falhou', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
    queued: { label: 'Na Fila', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    pending: { label: 'Pendente', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    approved: { label: 'Aprovado', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    cancelled: { label: 'Cancelado', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  };
  const c = config[s] || { label: status, className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
  return <Badge variant="outline" className={cn('text-xs border', c.className)}>{c.label}</Badge>;
};

const PlanBadge = ({ planId }: { planId: string | null }) => {
  if (!planId || planId === 'plan_free') return <Badge variant="outline" className="text-xs border-gray-500/30 text-gray-400">Free</Badge>;
  if (planId === 'plan_pro') return <Badge className="text-xs bg-primary/20 text-primary border border-primary/30">Pro</Badge>;
  if (planId === 'plan_enterprise') return <Badge className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">Enterprise</Badge>;
  return <Badge variant="outline" className="text-xs">{planId}</Badge>;
};

const HealthDot = ({ status }: { status: string }) => (
  <span className={cn('inline-block w-2.5 h-2.5 rounded-full', status === 'ok' ? 'bg-green-500 animate-pulse' : 'bg-red-500')} />
);

const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatUptime = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}h ${m}m`; };
const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

/* ── Mini stat card for overview ── */
const MiniStat = ({ icon: Icon, label, value, variant = 'default' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'warning' | 'info' | 'primary' | 'danger';
}) => {
  const iconColors: Record<string, string> = {
    default: 'text-white/70', success: 'text-green-400', warning: 'text-yellow-400',
    info: 'text-blue-400', primary: 'text-primary', danger: 'text-red-400',
  };
  return (
    <TiltCard tiltDegree={6} glare>
      <GlassCard className="p-4 glass-card-hover">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: [0, -12, 12, 0], scale: 1.15 }}
            transition={{ duration: 0.4 }}
            className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center flex-shrink-0"
          >
            <Icon className={cn('w-5 h-5', iconColors[variant])} />
          </motion.div>
          <div className="min-w-0">
            <p className="text-xs text-white/50 truncate">{label}</p>
            <p className="text-xl font-bold text-white">
              <AnimatedCounter value={value} />
            </p>
          </div>
        </div>
      </GlassCard>
    </TiltCard>
  );
};

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */

const Admin = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [system, setSystem] = useState<SystemHealth | null>(null);

  // Loading states
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Auto-refresh
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      setStatsError(null);
      const data = await api.get<AdminStats>('/admin/stats');
      setStats(data && typeof data === 'object' ? data : null);
    } catch (e: any) {
      console.error('[Admin] stats error:', e);
      setStatsError(e.message || 'Erro ao carregar stats');
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const data = await api.get<AdminUser[]>('/admin/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[Admin] users error:', e);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchJobs = useCallback(async (status?: string) => {
    try {
      setLoadingJobs(true);
      const qs = status ? `?status=${status}` : '';
      const data = await api.get<AdminJob[]>(`/admin/jobs${qs}`);
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[Admin] jobs error:', e);
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      setLoadingPayments(true);
      const data = await api.get<AdminPayment[]>('/admin/payments');
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[Admin] payments error:', e);
      setPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  const fetchSystem = useCallback(async () => {
    try {
      setLoadingSystem(true);
      const data = await api.get<SystemHealth>('/admin/system');
      setSystem(data && typeof data === 'object' ? data : null);
    } catch (e) {
      console.error('[Admin] system error:', e);
      setSystem(null);
    } finally {
      setLoadingSystem(false);
    }
  }, []);

  // Fetch stats on mount + auto-refresh 30s
  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStats]);

  // Fetch tab data on tab change
  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) fetchUsers();
    if (activeTab === 'jobs' && jobs.length === 0) fetchJobs();
    if (activeTab === 'payments' && payments.length === 0) fetchPayments();
    if (activeTab === 'system') fetchSystem();
  }, [activeTab, users.length, jobs.length, payments.length, fetchUsers, fetchJobs, fetchPayments, fetchSystem]);

  // Filtered users
  const filteredUsers = userSearch
    ? users.filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase()) || u.full_name?.toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  return (
    <div className="min-h-screen">
      <MouseSpotlight className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div className="mb-8" style={{ perspective: 800 }} initial="hidden" animate="visible" variants={headerVariants}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div whileHover={{ x: -4 }} whileTap={{ scale: 0.95 }}>
                <Button variant="ghost" asChild className="gap-2 text-white/50 hover:text-white hover:bg-white/5 h-9 px-3 -ml-3">
                  <Link to="/dashboard"><ArrowLeft className="w-4 h-4" />Voltar</Link>
                </Button>
              </motion.div>
            </div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button variant="outline" size="sm" onClick={fetchStats} disabled={loadingStats} className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10">
                <RefreshCw className={cn('w-4 h-4', loadingStats && 'animate-spin')} />
                Atualizar
              </Button>
            </motion.div>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center"
              whileHover={{ rotate: 15, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            >
              <Shield className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-white">Painel Admin</h1>
              <p className="text-sm text-white/50">{user?.email} — Controle total do SaaS</p>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white/5 border border-white/10 p-1">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-white/10"><BarChart3 className="w-4 h-4" />Visao Geral</TabsTrigger>
            <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-white/10"><Users className="w-4 h-4" />Usuarios</TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2 data-[state=active]:bg-white/10"><Briefcase className="w-4 h-4" />Jobs</TabsTrigger>
            <TabsTrigger value="payments" className="gap-2 data-[state=active]:bg-white/10"><DollarSign className="w-4 h-4" />Receita</TabsTrigger>
            <TabsTrigger value="system" className="gap-2 data-[state=active]:bg-white/10"><Server className="w-4 h-4" />Sistema</TabsTrigger>
          </TabsList>

          {/* ══════ OVERVIEW TAB ══════ */}
          <TabsContent value="overview">
            <motion.div className="space-y-6" style={{ perspective: 1000 }} initial="hidden" animate="visible" variants={containerVariants}>
              {/* Error banner */}
              {statsError && (
                <motion.div variants={cardVariants}>
                  <GlassCard className="p-4 border-red-500/20">
                    <div className="flex items-center gap-3 text-sm">
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-red-300 font-medium">Erro ao carregar dados</p>
                        <p className="text-red-400/70 text-xs mt-0.5">{statsError}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={fetchStats} className="ml-auto bg-white/5 border-white/10 text-white hover:bg-white/10">Tentar novamente</Button>
                    </div>
                  </GlassCard>
                </motion.div>
              )}
              {/* Stats Grid */}
              <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" variants={containerVariants}>
                <motion.div variants={cardVariants}><MiniStat icon={Users} label="Total Usuarios" value={stats?.totalUsers ?? 0} variant="primary" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={UserPlus} label="Novos (7 dias)" value={stats?.newUsers7d ?? 0} variant="success" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={Briefcase} label="Total Jobs" value={stats?.totalJobs ?? 0} variant="info" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={Activity} label="Jobs Ativos" value={stats?.activeJobs ?? 0} variant="warning" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={AlertTriangle} label="Jobs Falhos" value={stats?.failedJobs ?? 0} variant="danger" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={Clapperboard} label="Total Clips" value={stats?.totalClips ?? 0} variant="info" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={TrendingUp} label="Assinantes Pagos" value={stats?.paidSubscribers ?? 0} variant="success" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={DollarSign} label="MRR" value={stats?.mrr ? formatCurrency(stats.mrr) : 'R$ 0'} variant="primary" /></motion.div>
              </motion.div>

              {/* Queue Health */}
              <motion.div variants={cardVariants}>
                <TiltCard tiltDegree={3} glare>
                  <GlassCard className="p-5 glass-card-hover">
                    <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                      <Server className="w-4 h-4" /> Fila de Processamento (BullMQ)
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {[
                        { label: 'Aguardando', value: stats?.queue.waiting ?? 0, color: 'text-yellow-400' },
                        { label: 'Ativos', value: stats?.queue.active ?? 0, color: 'text-blue-400' },
                        { label: 'Concluidos', value: stats?.queue.completed ?? 0, color: 'text-green-400' },
                        { label: 'Falhos', value: stats?.queue.failed ?? 0, color: 'text-red-400' },
                        { label: 'Total', value: stats?.queue.total ?? 0, color: 'text-white' },
                      ].map((q) => (
                        <div key={q.label} className="text-center">
                          <p className={cn('text-2xl font-bold', q.color)}><AnimatedCounter value={q.value} /></p>
                          <p className="text-xs text-white/50">{q.label}</p>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </TiltCard>
              </motion.div>
            </motion.div>
          </TabsContent>

          {/* ══════ USERS TAB ══════ */}
          <TabsContent value="users">
            <motion.div className="space-y-4" initial="hidden" animate="visible" variants={containerVariants}>
              <motion.div variants={cardVariants} className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <Input
                    placeholder="Buscar por email ou nome..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loadingUsers} className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10">
                  <RefreshCw className={cn('w-4 h-4', loadingUsers && 'animate-spin')} />
                </Button>
                <Badge variant="outline" className="border-white/10 text-white/60">{filteredUsers.length} usuarios</Badge>
              </motion.div>

              <motion.div variants={cardVariants}>
                <GlassCard className="overflow-hidden">
                  {loadingUsers ? (
                    <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-white/50">
                            <th className="text-left p-3 font-medium">Email</th>
                            <th className="text-left p-3 font-medium">Nome</th>
                            <th className="text-left p-3 font-medium">Plano</th>
                            <th className="text-left p-3 font-medium">Status</th>
                            <th className="text-left p-3 font-medium">Cadastro</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((u) => (
                            <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="p-3 text-white">{u.email}</td>
                              <td className="p-3 text-white/70">{u.full_name || '—'}</td>
                              <td className="p-3"><PlanBadge planId={u.plan_id} /></td>
                              <td className="p-3">{u.sub_status ? <StatusBadge status={u.sub_status} /> : <span className="text-white/30">—</span>}</td>
                              <td className="p-3 text-white/50">{formatDate(u.created_at)}</td>
                            </tr>
                          ))}
                          {filteredUsers.length === 0 && (
                            <tr><td colSpan={5} className="p-6 text-center text-white/40">Nenhum usuario encontrado</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            </motion.div>
          </TabsContent>

          {/* ══════ JOBS TAB ══════ */}
          <TabsContent value="jobs">
            <motion.div className="space-y-4" initial="hidden" animate="visible" variants={containerVariants}>
              <motion.div variants={cardVariants} className="flex items-center gap-2 flex-wrap">
                {['', 'active', 'completed', 'failed', 'queued'].map((s) => (
                  <Button
                    key={s || 'all'}
                    variant={jobStatusFilter === s ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setJobStatusFilter(s); fetchJobs(s || undefined); }}
                    className={cn(
                      jobStatusFilter !== s && 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {s === '' ? 'Todos' : s === 'active' ? 'Ativos' : s === 'completed' ? 'Concluidos' : s === 'failed' ? 'Falhos' : 'Na Fila'}
                  </Button>
                ))}
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => fetchJobs(jobStatusFilter || undefined)} disabled={loadingJobs} className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10">
                  <RefreshCw className={cn('w-4 h-4', loadingJobs && 'animate-spin')} />
                </Button>
                <Badge variant="outline" className="border-white/10 text-white/60">{jobs.length} jobs</Badge>
              </motion.div>

              <motion.div variants={cardVariants}>
                <GlassCard className="overflow-hidden">
                  {loadingJobs ? (
                    <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-white/50">
                            <th className="text-left p-3 font-medium w-8"></th>
                            <th className="text-left p-3 font-medium">ID</th>
                            <th className="text-left p-3 font-medium">Usuario</th>
                            <th className="text-left p-3 font-medium">Fonte</th>
                            <th className="text-left p-3 font-medium">Status</th>
                            <th className="text-left p-3 font-medium">Progresso</th>
                            <th className="text-left p-3 font-medium">Step</th>
                            <th className="text-left p-3 font-medium">Criado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {jobs.map((j) => (
                            <Fragment key={j.id}>
                              <tr
                                className={cn(
                                  'border-b border-white/5 hover:bg-white/5 transition-colors',
                                  j.error && 'cursor-pointer',
                                )}
                                onClick={() => j.error && setExpandedJobId(expandedJobId === j.id ? null : j.id)}
                              >
                                <td className="p-3 text-white/30">
                                  {j.error ? (expandedJobId === j.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
                                </td>
                                <td className="p-3 text-white/70 font-mono text-xs">{j.id.slice(0, 8)}</td>
                                <td className="p-3 text-white">{j.user_email || j.user_id.slice(0, 8)}</td>
                                <td className="p-3 text-white/70">{j.source_type}</td>
                                <td className="p-3"><StatusBadge status={j.status} /></td>
                                <td className="p-3">
                                  {j.progress != null ? (
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary rounded-full" style={{ width: `${j.progress}%` }} />
                                      </div>
                                      <span className="text-xs text-white/50">{j.progress}%</span>
                                    </div>
                                  ) : <span className="text-white/30">—</span>}
                                </td>
                                <td className="p-3 text-white/50 text-xs">{j.current_step || '—'}</td>
                                <td className="p-3 text-white/50">{formatDate(j.created_at)}</td>
                              </tr>
                              {expandedJobId === j.id && j.error && (
                                <tr>
                                  <td colSpan={8} className="p-3 bg-red-500/5 border-b border-white/5">
                                    <div className="flex items-start gap-2 text-xs">
                                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                      <pre className="text-red-300 whitespace-pre-wrap font-mono">{j.error}</pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                          {jobs.length === 0 && (
                            <tr><td colSpan={8} className="p-6 text-center text-white/40">Nenhum job encontrado</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            </motion.div>
          </TabsContent>

          {/* ══════ REVENUE TAB ══════ */}
          <TabsContent value="payments">
            <motion.div className="space-y-4" initial="hidden" animate="visible" variants={containerVariants}>
              {/* Revenue stats */}
              <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-4" variants={containerVariants}>
                <motion.div variants={cardVariants}><MiniStat icon={DollarSign} label="MRR" value={stats?.mrr ? formatCurrency(stats.mrr) : 'R$ 0'} variant="primary" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={TrendingUp} label="Assinantes Pagos" value={stats?.paidSubscribers ?? 0} variant="success" /></motion.div>
                <motion.div variants={cardVariants}><MiniStat icon={Users} label="Total Usuarios" value={stats?.totalUsers ?? 0} variant="info" /></motion.div>
              </motion.div>

              {/* Payments table */}
              <motion.div variants={cardVariants} className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white/70">Historico de Pagamentos</h3>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loadingPayments} className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10">
                  <RefreshCw className={cn('w-4 h-4', loadingPayments && 'animate-spin')} />
                </Button>
              </motion.div>

              <motion.div variants={cardVariants}>
                <GlassCard className="overflow-hidden">
                  {loadingPayments ? (
                    <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
                  ) : payments.length === 0 ? (
                    <div className="p-8 text-center text-white/40">Nenhum pagamento registrado</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-white/50">
                            <th className="text-left p-3 font-medium">Data</th>
                            <th className="text-left p-3 font-medium">Usuario</th>
                            <th className="text-left p-3 font-medium">Plano</th>
                            <th className="text-left p-3 font-medium">Valor</th>
                            <th className="text-left p-3 font-medium">Status</th>
                            <th className="text-left p-3 font-medium">Metodo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="p-3 text-white/50">{formatDate(p.created_at)}</td>
                              <td className="p-3 text-white">{p.user_email || p.user_id.slice(0, 8)}</td>
                              <td className="p-3"><PlanBadge planId={p.plan_id} /></td>
                              <td className="p-3 text-white font-medium">{formatCurrency(p.amount)}</td>
                              <td className="p-3"><StatusBadge status={p.status} /></td>
                              <td className="p-3 text-white/50">{p.payment_method || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            </motion.div>
          </TabsContent>

          {/* ══════ SYSTEM TAB ══════ */}
          <TabsContent value="system">
            <motion.div className="space-y-4" initial="hidden" animate="visible" variants={containerVariants}>
              <motion.div variants={cardVariants} className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white/70">Saude do Sistema</h3>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={fetchSystem} disabled={loadingSystem} className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10">
                  <RefreshCw className={cn('w-4 h-4', loadingSystem && 'animate-spin')} />
                  Verificar
                </Button>
              </motion.div>

              {loadingSystem && !system ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
              ) : system ? (
                <>
                  {/* Health cards */}
                  <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-4" variants={containerVariants}>
                    <motion.div variants={cardVariants}>
                      <TiltCard tiltDegree={5} glare>
                        <GlassCard className="p-5 glass-card-hover">
                          <div className="flex items-center gap-3 mb-3">
                            <Database className="w-5 h-5 text-blue-400" />
                            <span className="font-medium text-white">PostgreSQL</span>
                            <div className="flex-1" />
                            <HealthDot status={system.database.status} />
                          </div>
                          <Separator className="bg-white/10 mb-3" />
                          {system.database.status === 'ok' ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                              <span className="text-sm text-white/70">Latencia: <strong className="text-white">{system.database.latencyMs}ms</strong></span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-red-400" />
                              <span className="text-sm text-red-300">{system.database.message}</span>
                            </div>
                          )}
                        </GlassCard>
                      </TiltCard>
                    </motion.div>

                    <motion.div variants={cardVariants}>
                      <TiltCard tiltDegree={5} glare>
                        <GlassCard className="p-5 glass-card-hover">
                          <div className="flex items-center gap-3 mb-3">
                            <Wifi className="w-5 h-5 text-red-400" />
                            <span className="font-medium text-white">Redis</span>
                            <div className="flex-1" />
                            <HealthDot status={system.redis.status} />
                          </div>
                          <Separator className="bg-white/10 mb-3" />
                          {system.redis.status === 'ok' ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                              <span className="text-sm text-white/70">Latencia: <strong className="text-white">{system.redis.latencyMs}ms</strong></span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-red-400" />
                              <span className="text-sm text-red-300">{system.redis.message}</span>
                            </div>
                          )}
                        </GlassCard>
                      </TiltCard>
                    </motion.div>

                    <motion.div variants={cardVariants}>
                      <TiltCard tiltDegree={5} glare>
                        <GlassCard className="p-5 glass-card-hover">
                          <div className="flex items-center gap-3 mb-3">
                            <Cpu className="w-5 h-5 text-purple-400" />
                            <span className="font-medium text-white">Processo</span>
                            <div className="flex-1" />
                            <HealthDot status="ok" />
                          </div>
                          <Separator className="bg-white/10 mb-3" />
                          <div className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-white/50">Uptime</span>
                              <span className="text-white font-medium">{formatUptime(system.process.uptimeSeconds)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-white/50">Memoria (RSS)</span>
                              <span className="text-white font-medium">{system.process.memoryMb.rss} MB</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-white/50">Heap</span>
                              <span className="text-white font-medium">{system.process.memoryMb.heapUsed}/{system.process.memoryMb.heapTotal} MB</span>
                            </div>
                          </div>
                        </GlassCard>
                      </TiltCard>
                    </motion.div>
                  </motion.div>

                  {/* Queue details */}
                  <motion.div variants={cardVariants}>
                    <TiltCard tiltDegree={3} glare>
                      <GlassCard className="p-5 glass-card-hover">
                        <div className="flex items-center gap-3 mb-3">
                          <Server className="w-5 h-5 text-amber-400" />
                          <span className="font-medium text-white">Fila BullMQ</span>
                        </div>
                        <Separator className="bg-white/10 mb-3" />
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          {[
                            { label: 'Aguardando', value: system.queue.waiting, color: 'text-yellow-400' },
                            { label: 'Ativos', value: system.queue.active, color: 'text-blue-400' },
                            { label: 'Concluidos', value: system.queue.completed, color: 'text-green-400' },
                            { label: 'Falhos', value: system.queue.failed, color: 'text-red-400' },
                            { label: 'Total', value: system.queue.total, color: 'text-white' },
                          ].map((q) => (
                            <div key={q.label} className="text-center">
                              <p className={cn('text-2xl font-bold', q.color)}>{q.value}</p>
                              <p className="text-xs text-white/50">{q.label}</p>
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    </TiltCard>
                  </motion.div>

                  {/* Environment info */}
                  <motion.div variants={cardVariants}>
                    <GlassCard className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <Clock className="w-5 h-5 text-white/50" />
                        <span className="font-medium text-white/70">Ambiente</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-white/50">NODE_ENV</p>
                          <Badge variant="outline" className="mt-1 border-white/10 text-white/70">{system.process.nodeEnv}</Badge>
                        </div>
                        <div>
                          <p className="text-white/50">Node.js</p>
                          <p className="text-white font-mono mt-1">{system.process.nodeVersion}</p>
                        </div>
                        <div>
                          <p className="text-white/50">Uptime</p>
                          <p className="text-white mt-1">{formatUptime(system.process.uptimeSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-white/50">Memoria Total</p>
                          <p className="text-white mt-1">{system.process.memoryMb.rss} MB</p>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                </>
              ) : (
                <GlassCard className="p-8 text-center text-white/40">
                  Clique em &quot;Verificar&quot; para checar o sistema
                </GlassCard>
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      </MouseSpotlight>
    </div>
  );
};

export default Admin;
