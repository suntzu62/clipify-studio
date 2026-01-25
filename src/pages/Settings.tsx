import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  LogOut,
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  Settings as SettingsIcon,
  Mail,
  Calendar,
  Zap
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getUsage, type UsageDTO } from '@/lib/usage';
import { api } from '@/lib/api-client';

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const SettingToggle = ({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-4">
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm text-white">
        {title}
      </Label>
      <p className="text-xs text-white/50">{description}</p>
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);

const Settings = () => {
  const { user, signOut, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { settings, updateSettings } = useUserSettings();
  const [usage, setUsage] = useState<UsageDTO | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [profileName, setProfileName] = useState(user?.full_name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  useEffect(() => {
    setProfileName(user?.full_name || '');
  }, [user?.full_name]);

  useEffect(() => {
    let active = true;
    const loadUsage = async () => {
      try {
        setUsageLoading(true);
        const usageData = await getUsage();
        if (active) {
          setUsage(usageData);
        }
      } catch {
        if (active) {
          setUsage(null);
        }
      } finally {
        if (active) {
          setUsageLoading(false);
        }
      }
    };

    if (user?.id) {
      loadUsage();
    } else {
      setUsageLoading(false);
    }

    return () => {
      active = false;
    };
  }, [user?.id]);

  const planLabel = useMemo(() => {
    if (!usage?.plan) return 'Free';
    return usage.plan.toString();
  }, [usage?.plan]);

  const handleProfileSave = async () => {
    const trimmed = profileName.trim();
    if (!trimmed) {
      toast.error('Informe um nome valido');
      return;
    }

    try {
      setSavingProfile(true);
      await api.patch('/auth/me', { fullName: trimmed });
      await refreshUser();
      setProfileOpen(false);
      toast.success('Perfil atualizado');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao atualizar perfil';
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Configuracoes</h1>
          </div>
          <p className="text-white/60">Gerencie sua conta e preferencias</p>
        </motion.div>

        <div className="space-y-6">
          {/* Profile Card */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.1 }}
          >
            <GlassCard className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-white mb-1">Perfil</h2>
                  <div className="space-y-2">
                    <div className="text-sm text-white/70">
                      {user?.full_name || 'Nome nao informado'}
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{user?.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <Calendar className="w-4 h-4" />
                      <span>
                        Membro desde {user?.created_at
                          ? new Date(user.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
                <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                    >
                      Editar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Editar perfil</DialogTitle>
                      <DialogDescription>
                        Atualize seu nome exibido no aplicativo.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="profile-name" className="text-white/70">
                        Nome
                      </Label>
                      <Input
                        id="profile-name"
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                        placeholder="Seu nome"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>
                    <DialogFooter>
                      <Button onClick={handleProfileSave} disabled={savingProfile}>
                        {savingProfile ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </GlassCard>
          </motion.div>

          {/* Subscription Card */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.15 }}
          >
            <GlassCard className="p-6 border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Plano {planLabel}</h3>
                    <p className="text-sm text-white/60">
                      {usageLoading
                        ? 'Carregando uso...'
                        : `${usage?.minutesRemaining ?? 0} minutos restantes`}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/billing')}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-semibold"
                >
                  Fazer Upgrade
                </Button>
              </div>
            </GlassCard>
          </motion.div>

          {/* Settings Sections */}
          <motion.div
            className="grid gap-3"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } }
            }}
          >
            <motion.div variants={fadeInUp}>
              <GlassCard className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-[1px]">
                    <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                      <Bell className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">Notificacoes</h3>
                    <p className="text-sm text-white/50">Ajuste alertas do processamento</p>
                  </div>
                </div>
                <Separator className="my-4 bg-white/10" />
                <div className="space-y-4">
                  <SettingToggle
                    id="notify-complete"
                    title="Avisar quando um clip estiver pronto"
                    description="Receba email ao finalizar o processamento."
                    checked={settings.notifications.jobCompleteEmail}
                    onChange={(value) =>
                      updateSettings({ notifications: { jobCompleteEmail: value } })
                    }
                  />
                  <SettingToggle
                    id="notify-fail"
                    title="Avisar quando houver falha"
                    description="Envia alerta quando um job falhar."
                    checked={settings.notifications.jobFailedEmail}
                    onChange={(value) =>
                      updateSettings({ notifications: { jobFailedEmail: value } })
                    }
                  />
                  <SettingToggle
                    id="notify-weekly"
                    title="Resumo semanal"
                    description="Receba um resumo com seus resultados."
                    checked={settings.notifications.weeklyDigest}
                    onChange={(value) =>
                      updateSettings({ notifications: { weeklyDigest: value } })
                    }
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <GlassCard className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 p-[1px]">
                    <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">Privacidade</h3>
                    <p className="text-sm text-white/50">Gerencie dados e compartilhamento</p>
                  </div>
                </div>
                <Separator className="my-4 bg-white/10" />
                <div className="space-y-4">
                  <SettingToggle
                    id="privacy-profile"
                    title="Perfil visivel para a equipe"
                    description="Permite que admins vejam seu perfil."
                    checked={settings.privacy.profileVisible}
                    onChange={(value) =>
                      updateSettings({ privacy: { profileVisible: value } })
                    }
                  />
                  <SettingToggle
                    id="privacy-analytics"
                    title="Compartilhar dados de uso anonimos"
                    description="Ajuda a melhorar o produto."
                    checked={settings.privacy.shareAnalytics}
                    onChange={(value) =>
                      updateSettings({ privacy: { shareAnalytics: value } })
                    }
                  />
                  <SettingToggle
                    id="privacy-personalized"
                    title="Recomendacoes personalizadas"
                    description="Ajusta sugestoes com base no seu uso."
                    checked={settings.privacy.personalizedRecommendations}
                    onChange={(value) =>
                      updateSettings({ privacy: { personalizedRecommendations: value } })
                    }
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <GlassCard className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 p-[1px]">
                    <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                      <Palette className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">Aparencia</h3>
                    <p className="text-sm text-white/50">Controle detalhes visuais</p>
                  </div>
                </div>
                <Separator className="my-4 bg-white/10" />
                <div className="space-y-4">
                  <SettingToggle
                    id="appearance-motion"
                    title="Reduzir animacoes"
                    description="Diminui transicoes e efeitos."
                    checked={settings.appearance.reduceMotion}
                    onChange={(value) =>
                      updateSettings({ appearance: { reduceMotion: value } })
                    }
                  />
                  <SettingToggle
                    id="appearance-glass"
                    title="Efeito de vidro"
                    description="Ativa o blur nos cards e barras."
                    checked={settings.appearance.glassEffects}
                    onChange={(value) =>
                      updateSettings({ appearance: { glassEffects: value } })
                    }
                  />
                  <SettingToggle
                    id="appearance-contrast"
                    title="Alto contraste"
                    description="Melhora legibilidade em fundos escuros."
                    checked={settings.appearance.highContrast}
                    onChange={(value) =>
                      updateSettings({ appearance: { highContrast: value } })
                    }
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <GlassCard className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 p-[1px]">
                    <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                      <Globe className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">Idioma</h3>
                    <p className="text-sm text-white/50">Selecione o idioma da interface</p>
                  </div>
                </div>
                <Separator className="my-4 bg-white/10" />
                <Select
                  value={settings.language}
                  onValueChange={(value) =>
                    updateSettings({ language: value as 'pt-BR' | 'en-US' | 'es-ES' })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Selecione um idioma" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0f] border-white/10 text-white">
                    <SelectItem value="pt-BR">Portugues (Brasil)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="es-ES">Espanol</SelectItem>
                  </SelectContent>
                </Select>
              </GlassCard>
            </motion.div>
          </motion.div>

          {/* Danger Zone */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.4 }}
          >
            <GlassCard className="p-6 border-red-500/20">
              <h3 className="text-lg font-semibold text-red-400 mb-4">Zona de Perigo</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80">Sair da conta</p>
                  <p className="text-sm text-white/50">Voce sera desconectado de todos os dispositivos</p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleSignOut}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
