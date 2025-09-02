import { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  createCheckoutSession, 
  createCustomerPortalSession, 
  getUsage, 
  getPlanDisplayName, 
  getPlanPrice, 
  getPlanFeatures,
  UsageData 
} from "@/lib/billing";

const Billing = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  const loadUsage = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const usageData = await getUsage(user.id);
      setUsage(usageData);
    } catch (error) {
      console.error("Error loading usage:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados de uso.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
  }, [user]);

  const handleCheckout = async (plan: "pro" | "scale") => {
    if (!user) return;
    
    try {
      setCreating(plan);
      const { url } = await createCheckoutSession(plan, user.id);
      
      // Open in new tab
      window.open(url, '_blank');
      
      toast({
        title: "Redirecionando...",
        description: "Abrindo checkout do Stripe em nova aba.",
      });
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

  const handleCustomerPortal = async () => {
    if (!user) return;
    
    try {
      const { url } = await createCustomerPortalSession(user.id);
      
      // Open in new tab
      window.open(url, '_blank');
      
      toast({
        title: "Redirecionando...",
        description: "Abrindo portal de gerenciamento em nova aba.",
      });
    } catch (error) {
      console.error("Portal error:", error);
      toast({
        title: "Erro",
        description: "Não foi possível acessar o portal de gerenciamento.",
        variant: "destructive",
      });
    }
  };

  const plans = [
    {
      id: "free",
      name: "Gratuito",
      price: "R$ 0",
      description: "Perfeito para começar",
      features: getPlanFeatures("free"),
    },
    {
      id: "pro",
      name: "Pro",
      price: "R$ 49,99",
      description: "Para criadores profissionais",
      features: getPlanFeatures("pro"),
    },
    {
      id: "scale",
      name: "Scale",
      price: "R$ 199,99",
      description: "Para agências e empresas",
      features: getPlanFeatures("scale"),
    },
  ];

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
                    Plano Atual: {getPlanDisplayName(usage.plan)}
                    <Badge variant={usage.status === "active" ? "default" : "secondary"}>
                      {usage.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {usage.periodEnd && (
                      <>Renovação em: {new Date(usage.periodEnd).toLocaleDateString("pt-BR")}</>
                    )}
                  </CardDescription>
                </div>
                {usage.plan !== "free" && (
                  <Button onClick={handleCustomerPortal} variant="outline">
                    Gerenciar Assinatura
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Minutes Usage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Minutos de Processamento</span>
                  <span>{usage.minutesUsed} / {usage.minutesQuota}</span>
                </div>
                <Progress 
                  value={(usage.minutesUsed / usage.minutesQuota) * 100} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {usage.minutesRemaining} minutos restantes
                </p>
              </div>

              <Separator />

              {/* Shorts Usage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Shorts Gerados</span>
                  <span>{usage.shortsUsed} / {usage.shortsQuota}</span>
                </div>
                <Progress 
                  value={(usage.shortsUsed / usage.shortsQuota) * 100} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {usage.shortsRemaining} shorts restantes
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
          {plans.map((plan) => (
            <Card 
              key={plan.id}
              className={`relative ${
                usage?.plan === plan.id 
                  ? "border-primary shadow-lg" 
                  : ""
              }`}
            >
              {usage?.plan === plan.id && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                  Plano Atual
                </Badge>
              )}
              
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="text-3xl font-bold text-primary">
                  {plan.price}
                  {plan.id !== "free" && <span className="text-sm font-normal">/mês</span>}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <div className="w-1 h-1 bg-primary rounded-full" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <div className="pt-4">
                  {plan.id === "free" ? (
                    <Button disabled className="w-full">
                      {usage?.plan === "free" ? "Plano Atual" : "Gratuito"}
                    </Button>
                  ) : usage?.plan === plan.id ? (
                    <Button onClick={handleCustomerPortal} variant="outline" className="w-full">
                      Gerenciar
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => handleCheckout(plan.id as "pro" | "scale")}
                      disabled={creating === plan.id}
                      className="w-full"
                    >
                      {creating === plan.id ? "Processando..." : `Assinar ${plan.name}`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Informações Importantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              • Os planos são cobrados mensalmente e renovados automaticamente.
            </p>
            <p>
              • Você pode cancelar ou alterar seu plano a qualquer momento através do portal de gerenciamento.
            </p>
            <p>
              • As quotas de uso são resetadas no início de cada ciclo de cobrança.
            </p>
            <p>
              • Suporte técnico está disponível para todos os planos via email: suporte@cortai.com
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Billing;