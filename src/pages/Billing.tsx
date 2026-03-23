import { useState, useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { initPosthog } from "@/lib/posthog";
import {
  getUsageLimits,
  createCardPayment,
  getCurrentSubscription,
  cancelSubscription,
  translateStatus,
  getStatusBadgeVariant,
  type UsageLimits,
  type Subscription,
} from "@/lib/mercadopago";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Zap,
  Crown,
  Building2,
  Sparkles,
  Film,
  Clock,
  ArrowRight,
  RefreshCw,
  Loader2,
  Shield,
  CreditCard,
  RotateCcw,
  CalendarCheck,
  ArrowLeft,
  X,
} from "lucide-react";
import { FloatingOrbs, TiltCard, AnimatedText } from "@/components/landing";
import { cn } from "@/lib/utils";

// ============================================
// Animated Counter Component
// ============================================
function AnimatedNumber({ value, duration = 1.5 }: { value: number; duration?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString("pt-BR"));
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const controls = animate(count, value, {
      duration,
      ease: "easeOut",
    });
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value, duration, count, rounded]);

  return <span>{display}</span>;
}

// ============================================
// Animated Progress Ring
// ============================================
function ProgressRing({
  value,
  max,
  label,
  icon: Icon,
  color,
}: {
  value: number;
  max: number;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="flex flex-col items-center gap-3"
    >
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="8"
            opacity={0.3}
          />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="w-5 h-5 mb-1" style={{ color }} />
          <span className="text-2xl font-bold">
            <AnimatedNumber value={value} />
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          de <AnimatedNumber value={max} /> disponíveis
        </p>
      </div>
    </motion.div>
  );
}

// ============================================
// Plan Card Data
// ============================================
const plansData = [
  {
    id: "plan_free",
    name: "Grátis",
    price: 0,
    period: "",
    description: "Perfeito para começar",
    icon: Zap,
    gradient: "from-slate-500/20 to-slate-600/10",
    borderColor: "border-white/10",
    accentColor: "hsl(220 15% 60%)",
    features: [
      "5 clips por mês",
      "30 minutos de vídeo",
      "Legendas básicas",
      "Marca d'água CortAI",
    ],
  },
  {
    id: "plan_pro",
    name: "Pro",
    price: 50,
    period: "/mês",
    description: "Para criadores de conteúdo",
    icon: Crown,
    highlight: true,
    gradient: "from-primary/30 via-primary/10 to-neon-secondary/20",
    borderColor: "border-primary/50",
    accentColor: "hsl(262 100% 66%)",
    features: [
      "50 clips por mês",
      "5 horas de vídeo",
      "Sem marca d'água",
      "Legendas avançadas",
      "Templates premium",
      "Suporte prioritário",
    ],
  },
  {
    id: "plan_enterprise",
    name: "Enterprise",
    price: 150,
    period: "/mês",
    description: "Para agências e empresas",
    icon: Building2,
    gradient: "from-amber-500/20 via-orange-500/10 to-yellow-500/10",
    borderColor: "border-amber-500/30",
    accentColor: "hsl(35 95% 58%)",
    features: [
      "500 clips por mês",
      "25 horas de vídeo",
      "Sem marca d'água",
      "Todas as features",
      "API access",
      "Branding customizado",
      "Suporte dedicado",
    ],
  },
];

// ============================================
// Stagger Animation Variants
// ============================================
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 200, damping: 25 },
  },
};

const featureVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

// ============================================
// Main Component
// ============================================
const Billing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageLimits | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [planName, setPlanName] = useState("Grátis");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadUsage = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setLoadError(false);
      const [usageData, subData] = await Promise.all([
        getUsageLimits(),
        getCurrentSubscription(),
      ]);
      setUsage(usageData);
      setPlanName(usageData.planName);
      setSubscription(subData.subscription);
    } catch (error) {
      console.error("Error loading usage:", error);
      setLoadError(true);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar seu plano e uso. Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initPosthog();
    loadUsage();
  }, [user]);

  const handleCheckout = async (planId: string) => {
    if (!user) return;

    try {
      setCreating(planId);
      const { checkoutUrl } = await createCardPayment(planId, "monthly");
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Erro",
        description: "Não foi possível criar sessão de checkout.",
        variant: "destructive",
      });
    } finally {
      setCreating(null);
    }
  };

  const handleCancel = async () => {
    if (!subscription) return;

    try {
      setCancelling(true);
      await cancelSubscription(subscription.id);
      toast({
        title: "Assinatura cancelada",
        description: "Sua assinatura foi cancelada. Você pode continuar usando até o fim do período.",
      });
      await loadUsage();
    } catch (error) {
      console.error("Cancel error:", error);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar a assinatura.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleGoBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }

    navigate("/dashboard");
  };

  const currentPlanId = subscription?.plan_id || "plan_free";
  const isFreeTier = !subscription || subscription.plan_id === "plan_free";

  // ============================================
  // Loading State
  // ============================================
  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <FloatingOrbs variant="light" />
        <div className="relative z-10 flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 mx-auto mb-4"
            >
              <Loader2 className="w-12 h-12 text-primary" />
            </motion.div>
            <p className="text-muted-foreground text-lg">Carregando seu plano...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // ============================================
  // Error State
  // ============================================
  if (loadError && !usage) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <FloatingOrbs variant="light" />
        <div className="relative z-10 flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
              className="w-16 h-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center"
            >
              <X className="w-8 h-8 text-destructive" />
            </motion.div>
            <h2 className="text-2xl font-bold mb-3">Erro ao carregar dados</h2>
            <p className="text-muted-foreground mb-8">
              Não conseguimos carregar as informações do seu plano. Isso pode ser um problema temporário.
            </p>
            <Button onClick={loadUsage} size="lg" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ============================================
  // Main Content
  // ============================================
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background Effects */}
      <FloatingOrbs />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(262_100%_65%/0.08),transparent_60%)] pointer-events-none" />

      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6"
          >
            <Button
              variant="ghost"
              onClick={handleGoBack}
              className="gap-2 border border-white/10 bg-white/5 px-3 text-white/70 backdrop-blur-sm hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Planos e Billing</span>
            </motion.div>

            <AnimatedText
              text="Escolha o plano ideal para você"
              as="h1"
              className="text-4xl md:text-5xl font-bold mb-4"
              staggerDelay={0.04}
              highlightWords={{ ideal: "text-primary" }}
            />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-lg text-muted-foreground max-w-xl mx-auto"
            >
              Gerencie sua assinatura, acompanhe seu uso e escale sua produção de conteúdo
            </motion.p>
          </motion.div>

          {/* Usage Dashboard */}
          {usage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="mb-16"
            >
              <Card className="glass-card border border-white/10 overflow-hidden">
                <CardContent className="p-8">
                  {/* Plan Badge + Cancel */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center"
                      >
                        {isFreeTier ? (
                          <Zap className="w-6 h-6 text-primary" />
                        ) : (
                          <Crown className="w-6 h-6 text-primary" />
                        )}
                      </motion.div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold">Plano {planName}</h3>
                          {subscription && (
                            <Badge variant={getStatusBadgeVariant(subscription.status)} className="text-xs">
                              {translateStatus(subscription.status)}
                            </Badge>
                          )}
                          {!subscription && (
                            <Badge variant="secondary" className="text-xs">Ativo</Badge>
                          )}
                        </div>
                        {subscription?.current_period_end && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Renova em {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button onClick={loadUsage} variant="ghost" size="sm" className="gap-1.5 text-xs">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Atualizar
                      </Button>
                      {!isFreeTier && subscription && subscription.status === "active" && (
                        <Button
                          onClick={handleCancel}
                          variant="ghost"
                          size="sm"
                          disabled={cancelling}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          {cancelling ? "Cancelando..." : "Cancelar plano"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Usage Rings */}
                  <div className="grid grid-cols-2 gap-8 max-w-md mx-auto">
                    <ProgressRing
                      value={usage.clips.used}
                      max={usage.clips.limit}
                      label="Clips Usados"
                      icon={Film}
                      color="hsl(262 100% 66%)"
                    />
                    <ProgressRing
                      value={usage.minutes.used}
                      max={usage.minutes.limit}
                      label="Minutos Usados"
                      icon={Clock}
                      color="hsl(200 100% 60%)"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Plans Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-16"
          >
            {plansData.map((plan) => {
              const isCurrent = currentPlanId === plan.id;
              const PlanIcon = plan.icon;

              return (
                <motion.div key={plan.id} variants={cardVariants}>
                  <TiltCard tiltDegree={plan.highlight ? 6 : 4} glare>
                    <Card
                      className={cn(
                        "relative overflow-hidden h-full border-2 transition-all duration-300",
                        plan.highlight
                          ? "border-primary/60 shadow-glow"
                          : plan.borderColor,
                        isCurrent && !plan.highlight && "border-primary/40",
                      )}
                    >
                      {/* Background Gradient */}
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none",
                        plan.gradient,
                      )} />

                      {/* Highlight Badge */}
                      {plan.highlight && (
                        <motion.div
                          initial={{ y: -40 }}
                          animate={{ y: 0 }}
                          transition={{ type: "spring", stiffness: 300, delay: 0.5 }}
                          className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary to-neon-secondary text-white text-center py-2 text-sm font-semibold"
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Mais Popular
                            <Sparkles className="w-3.5 h-3.5" />
                          </span>
                        </motion.div>
                      )}

                      {/* Current Plan Badge */}
                      {isCurrent && !plan.highlight && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, delay: 0.6 }}
                        >
                          <Badge className="absolute top-3 left-1/2 -translate-x-1/2 z-10 neon-glow">
                            Plano Atual
                          </Badge>
                        </motion.div>
                      )}

                      <CardContent className={cn(
                        "relative z-10 p-6 flex flex-col h-full",
                        plan.highlight ? "pt-14" : "pt-8",
                      )}>
                        {/* Icon + Name */}
                        <div className="text-center mb-6">
                          <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                            style={{ background: `linear-gradient(135deg, ${plan.accentColor}33, ${plan.accentColor}11)` }}
                          >
                            <PlanIcon className="w-7 h-7" style={{ color: plan.accentColor }} />
                          </motion.div>
                          <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        </div>

                        {/* Price */}
                        <div className="text-center mb-6">
                          <div className="flex items-baseline justify-center gap-1">
                            <span className="text-sm text-muted-foreground">R$</span>
                            <span className="text-5xl font-black tracking-tight">
                              {plan.price === 0 ? "0" : <AnimatedNumber value={plan.price} />}
                            </span>
                            {plan.period && (
                              <span className="text-sm text-muted-foreground">{plan.period}</span>
                            )}
                          </div>
                        </div>

                        {/* Features */}
                        <motion.ul
                          variants={containerVariants}
                          initial="hidden"
                          animate="visible"
                          className="space-y-3 mb-8 flex-1"
                        >
                          {plan.features.map((feature, i) => (
                            <motion.li
                              key={i}
                              variants={featureVariants}
                              transition={{ delay: 0.5 + i * 0.06 }}
                              className="flex items-center gap-2.5 text-sm"
                            >
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: `${plan.accentColor}22` }}
                              >
                                <Check className="w-3 h-3" style={{ color: plan.accentColor }} />
                              </div>
                              {feature}
                            </motion.li>
                          ))}
                        </motion.ul>

                        {/* CTA Button */}
                        <div className="mt-auto">
                          {plan.id === "plan_free" ? (
                            <Button
                              disabled
                              variant="ghost"
                              className="w-full h-12 text-base"
                            >
                              {isCurrent ? "Plano Atual" : "Gratuito"}
                            </Button>
                          ) : isCurrent ? (
                            <Button
                              variant="outline"
                              className="w-full h-12 text-base neon-glow"
                              disabled
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Plano Atual
                            </Button>
                          ) : (
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                              <Button
                                onClick={() => handleCheckout(plan.id)}
                                disabled={creating === plan.id}
                                className={cn(
                                  "w-full h-12 text-base font-semibold gap-2 transition-all",
                                  plan.highlight
                                    ? "bg-gradient-to-r from-primary to-neon-secondary hover:opacity-90 shadow-glow"
                                    : "",
                                )}
                                variant={plan.highlight ? "default" : "outline"}
                              >
                                {creating === plan.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Processando...
                                  </>
                                ) : (
                                  <>
                                    Assinar {plan.name}
                                    <ArrowRight className="w-4 h-4" />
                                  </>
                                )}
                              </Button>
                            </motion.div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TiltCard>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Trust Badges */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {[
              { icon: Shield, text: "Pagamento seguro" },
              { icon: CreditCard, text: "Cartão, PIX e boleto" },
              { icon: RotateCcw, text: "Cancele quando quiser" },
              { icon: CalendarCheck, text: "Renovação automática" },
            ].map((badge, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.1 }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]"
              >
                <badge.icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground text-center">{badge.text}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Billing;
