import { motion } from 'framer-motion';
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Star } from "lucide-react";
import { TiltCard, AnimatedText } from '@/components/landing';

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 60, rotateY: -5 },
  visible: {
    opacity: 1,
    y: 0,
    rotateY: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const Pricing = () => {
  const navigate = useNavigate();

  const plans = [
    {
      id: "plan_free",
      name: "Grátis",
      price: "R$ 0",
      period: "",
      description: "Perfeito para começar",
      quota: "5 clips/mês",
      features: [
        "5 clips por mês",
        "30 minutos de vídeo",
        "Legendas básicas",
        "Marca d'água CortAI",
      ],
      highlight: false,
      cta: "Começar Grátis",
    },
    {
      id: "plan_pro",
      name: "Pro",
      price: "R$ 50",
      period: "/mês",
      description: "Para criadores de conteúdo",
      quota: "50 clips/mês",
      features: [
        "50 clips por mês",
        "5 horas de vídeo",
        "Sem marca d'água",
        "Legendas avançadas",
        "Templates premium",
        "Suporte prioritário",
      ],
      highlight: true,
      cta: "Começar Agora",
    },
    {
      id: "plan_enterprise",
      name: "Enterprise",
      price: "R$ 150",
      period: "/mês",
      description: "Para agências e empresas",
      quota: "500 clips/mês",
      features: [
        "500 clips por mês",
        "25 horas de vídeo",
        "Sem marca d'água",
        "Todas as features",
        "API access",
        "Branding customizado",
        "Suporte dedicado",
      ],
      highlight: false,
      cta: "Começar Agora",
    },
  ];

  const handleCta = (planId: string) => {
    if (planId === "plan_free") {
      navigate("/auth/register");
    } else {
      navigate(`/auth/register?plan=${planId}`);
    }
  };

  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <AnimatedText
            text="Planos que cabem no seu bolso"
            as="h2"
            className="text-3xl md:text-5xl font-bold text-foreground"
          />
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-xl text-muted-foreground max-w-3xl mx-auto"
          >
            Escolha o plano ideal para o seu volume de conteúdo. Sem taxas ocultas, sem surpresas.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="inline-flex items-center gap-2 bg-gradient-primary text-white px-4 py-2 rounded-full text-sm font-medium"
          >
            <Star className="h-4 w-4" />
            Comece grátis — sem cartão de crédito
          </motion.div>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto"
          style={{ perspective: 1200 }}
        >
          {plans.map((plan) => (
            <motion.div key={plan.id} variants={cardVariants}>
              <TiltCard tiltDegree={8} glare>
                <Card
                  className={`relative overflow-hidden transition-all duration-300 ${
                    plan.highlight
                      ? 'border-primary neon-glow glass-card animate-float'
                      : 'glass-card glass-card-hover border-border/50'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute top-0 left-0 right-0 bg-gradient-primary animate-aurora text-white text-center py-2 text-sm font-medium">
                      Mais Popular
                    </div>
                  )}

                  <CardHeader className={`text-center ${plan.highlight ? 'pt-12' : 'pt-6'}`}>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-bold gradient-text-premium animate-gradient-text">
                          {plan.price}
                        </span>
                        <span className="text-muted-foreground">{plan.period}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                      <div className="text-lg font-semibold text-primary">{plan.quota}</div>
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
                      className={`w-full ${plan.highlight ? 'btn-premium' : ''}`}
                      size="lg"
                      onClick={() => handleCta(plan.id)}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-center mt-12 space-y-4"
        >
          <p className="text-muted-foreground">
            Cancele a qualquer momento • Pagamento seguro via MercadoPago
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
