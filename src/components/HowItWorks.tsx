import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Brain, Scissors, Share2, ArrowRight } from "lucide-react";

const HowItWorks = () => {
  const steps = [
    {
      icon: Upload,
      title: "1. Envie seu vídeo",
      description: "Cole o link do YouTube (≥10 min) e confirme os direitos de uso",
      color: "from-blue-500 to-purple-600"
    },
    {
      icon: Brain,
      title: "2. IA processa",
      description: "Transcrição, análise de conteúdo e identificação dos melhores trechos",
      color: "from-purple-600 to-pink-600"
    },
    {
      icon: Scissors,
      title: "3. Clipes gerados",
      description: "8-12 clipes de 30-90s com legendas e textos otimizados",
      color: "from-pink-600 to-red-500"
    },
    {
      icon: Share2,
      title: "4. Publique tudo",
      description: "Revise e publique nos YouTube Shorts + blog post automático",
      color: "from-red-500 to-orange-500"
    }
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground">
            Como funciona
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            4 passos simples para transformar seus vídeos em dezenas de conteúdos virais
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <Card className="text-center p-6 h-full group hover:shadow-xl transition-all duration-300 hover:scale-105">
                  <CardContent className="space-y-4">
                    <div className={`w-16 h-16 mx-auto rounded-xl bg-gradient-to-r ${step.color} p-4 group-hover:scale-110 transition-transform duration-300`}>
                      <step.icon className="w-full h-full text-white" />
                    </div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="text-muted-foreground text-sm">{step.description}</p>
                  </CardContent>
                </Card>
                
                {/* Arrow for desktop */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ArrowRight className="h-6 w-6 text-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Timeline for mobile */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="flex flex-col items-center space-y-4">
              {steps.map((_, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  {index < steps.length - 1 && (
                    <div className="w-px h-8 bg-border ml-1" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Button variant="hero" size="lg" className="group">
              Experimente Grátis Agora
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              Sem cartão de crédito • 7 dias grátis • Cancele quando quiser
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;