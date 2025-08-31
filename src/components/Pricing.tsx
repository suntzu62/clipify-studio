import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Star } from "lucide-react";

const Pricing = () => {
  const plans = [
    {
      name: "Starter",
      price: "R$ 97",
      period: "/mês",
      description: "Perfeito para criadores iniciantes",
      minutes: "300 minutos",
      features: [
        "Até 300 minutos de processamento",
        "8-12 clipes por vídeo",
        "Legendas automáticas",
        "Títulos e descrições gerados",
        "Upload no YouTube Shorts",
        "1 blog post por vídeo",
        "Suporte por email"
      ],
      highlight: false
    },
    {
      name: "Professional",
      price: "R$ 297",
      period: "/mês",
      description: "Para criadores profissionais",
      minutes: "1000 minutos",
      features: [
        "Até 1000 minutos de processamento",
        "8-12 clipes por vídeo",
        "Legendas automáticas",
        "Títulos e descrições gerados",
        "Upload automático em múltiplas redes",
        "3 blog posts por vídeo",
        "Analytics avançados",
        "Suporte prioritário",
        "Templates personalizados"
      ],
      highlight: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "Para empresas e agências",
      minutes: "Ilimitado",
      features: [
        "Minutos ilimitados",
        "API privada",
        "White-label disponível",
        "Integração personalizada",
        "Suporte dedicado 24/7",
        "SLA garantido",
        "Treinamento da equipe",
        "Relatórios personalizados"
      ],
      highlight: false
    }
  ];

  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground">
            Planos que cabem no seu bolso
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Escolha o plano ideal para o seu volume de conteúdo. Sem taxas ocultas, sem surpresas.
          </p>
          <div className="inline-flex items-center gap-2 bg-gradient-primary text-white px-4 py-2 rounded-full text-sm font-medium">
            <Star className="h-4 w-4" />
            7 dias grátis em todos os planos
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`relative overflow-hidden transition-all duration-300 hover:scale-105 ${
                plan.highlight 
                  ? 'border-primary shadow-glow bg-gradient-card' 
                  : 'hover:shadow-xl border-border/50'
              }`}
            >
              {plan.highlight && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-primary text-white text-center py-2 text-sm font-medium">
                  Mais Popular
                </div>
              )}
              
              <CardHeader className={`text-center ${plan.highlight ? 'pt-12' : 'pt-6'}`}>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-primary">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <div className="text-lg font-semibold text-primary">{plan.minutes}</div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  variant={plan.highlight ? "hero" : "default"} 
                  className="w-full"
                  size="lg"
                >
                  {plan.name === "Enterprise" ? "Falar com Vendas" : "Começar Agora"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12 space-y-4">
          <p className="text-muted-foreground">
            Todos os planos incluem 7 dias grátis • Cancele a qualquer momento
          </p>
          <p className="text-sm text-muted-foreground">
            Precisa de mais minutos? <a href="#contact" className="text-primary hover:underline">Entre em contato</a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;