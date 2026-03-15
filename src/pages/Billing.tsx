import { useState, useEffect } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Check } from "lucide-react";

const Billing = () => {
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

  const plans = [
    {
      id: "plan_free",
      name: "Grátis",
      price: "R$ 0",
      period: "",
      description: "Perfeito para começar",
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
      price: "R$ 50",
      period: "/mês",
      description: "Para criadores de conteúdo",
      highlight: true,
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
      price: "R$ 150",
      period: "/mês",
      description: "Para agências e empresas",
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

  const currentPlanId = subscription?.plan_id || "plan_free";
  const isFreeTier = !subscription || subscription.plan_id === "plan_free";

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando informações de billing...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError && !usage) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold mb-2">Erro ao carregar dados</h2>
            <p className="text-muted-foreground mb-6">
              Não conseguimos carregar as informações do seu plano. Isso pode ser um problema temporário de conexão.
            </p>
            <Button onClick={loadUsage} size="lg">
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Planos e Billing</h1>
          <p className="text-muted-foreground">
            Gerencie sua assinatura e acompanhe seu uso
          </p>
        </div>

        {/* Current Plan Status */}
        {usage && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Plano Atual: {planName}
                    {subscription && (
                      <Badge variant={getStatusBadgeVariant(subscription.status)}>
                        {translateStatus(subscription.status)}
                      </Badge>
                    )}
                    {!subscription && (
                      <Badge variant="secondary">Grátis</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {subscription?.current_period_end && (
                      <>Renovação em: {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</>
                    )}
                  </CardDescription>
                </div>
                {!isFreeTier && subscription && subscription.status === "active" && (
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    disabled={cancelling}
                  >
                    {cancelling ? "Cancelando..." : "Cancelar Assinatura"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Clips Usage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Clips Gerados</span>
                  <span>{usage.clips.used} / {usage.clips.limit}</span>
                </div>
                <Progress
                  value={usage.clips.limit > 0 ? (usage.clips.used / usage.clips.limit) * 100 : 0}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {usage.clips.remaining} clips restantes
                </p>
              </div>

              <Separator />

              {/* Minutes Usage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Minutos de Processamento</span>
                  <span>{usage.minutes.used} / {usage.minutes.limit}</span>
                </div>
                <Progress
                  value={usage.minutes.limit > 0 ? (usage.minutes.used / usage.minutes.limit) * 100 : 0}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {usage.minutes.remaining} minutos restantes
                </p>
              </div>

              <div className="flex justify-between items-center pt-4">
                <Button onClick={loadUsage} variant="ghost" size="sm">
                  Atualizar Status
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentPlanId === plan.id;
            const isHighlight = "highlight" in plan && plan.highlight;

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  isHighlight
                    ? "border-primary shadow-lg"
                    : isCurrent
                      ? "border-primary/50"
                      : ""
                }`}
              >
                {isHighlight && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary to-primary/80 text-white text-center py-1.5 text-sm font-medium rounded-t-lg">
                    Mais Popular
                  </div>
                )}
                {isCurrent && !isHighlight && (
                  <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    Plano Atual
                  </Badge>
                )}

                <CardHeader className={`text-center ${isHighlight ? "pt-12" : ""}`}>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="text-3xl font-bold text-primary">
                    {plan.price}
                    {plan.period && <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4">
                    {plan.id === "plan_free" ? (
                      <Button disabled className="w-full">
                        {isCurrent ? "Plano Atual" : "Gratuito"}
                      </Button>
                    ) : isCurrent ? (
                      <Button variant="outline" className="w-full" disabled>
                        Plano Atual
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleCheckout(plan.id)}
                        disabled={creating === plan.id}
                        variant={isHighlight ? "default" : "outline"}
                        className="w-full"
                      >
                        {creating === plan.id ? "Processando..." : `Assinar ${plan.name}`}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Additional Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Informações Importantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              • Os planos são cobrados mensalmente via MercadoPago e renovados automaticamente.
            </p>
            <p>
              • Você pode cancelar seu plano a qualquer momento. O acesso continua até o fim do período pago.
            </p>
            <p>
              • As quotas de uso são resetadas no início de cada ciclo de cobrança.
            </p>
            <p>
              • Pagamento seguro via MercadoPago — cartão de crédito, PIX e boleto.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Billing;
