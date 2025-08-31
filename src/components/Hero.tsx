import { Button } from "@/components/ui/button";
import { Play, Zap, TrendingUp } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-background/10 to-transparent" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-glow/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      
      <div className="container px-6 mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="text-center lg:text-left space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight">
                Transforme seus{" "}
                <span className="bg-gradient-to-r from-white to-primary-glow bg-clip-text text-transparent">
                  vídeos longos
                </span>{" "}
                em conteúdo viral
              </h1>
              <p className="text-xl text-white/80 max-w-2xl">
                IA avançada que converte seus vídeos do YouTube em 8-12 clipes curtos otimizados, 
                com blog posts automáticos e upload direto para redes sociais.
              </p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 justify-center lg:justify-start">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">10x</div>
                <div className="text-white/60">Mais Alcance</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">90%</div>
                <div className="text-white/60">Menos Tempo</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">+500%</div>
                <div className="text-white/60">Engajamento</div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button variant="hero" size="lg" className="group">
                <Play className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />
                Comece Grátis
              </Button>
              <Button variant="outline" size="lg" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                Ver Demo
              </Button>
            </div>

            {/* Features */}
            <div className="flex flex-wrap gap-6 justify-center lg:justify-start pt-4">
              <div className="flex items-center gap-2 text-white/80">
                <Zap className="h-4 w-4 text-primary-glow" />
                <span className="text-sm">Processamento em minutos</span>
              </div>
              <div className="flex items-center gap-2 text-white/80">
                <TrendingUp className="h-4 w-4 text-primary-glow" />
                <span className="text-sm">IA otimizada para viral</span>
              </div>
            </div>
          </div>

          {/* Image */}
          <div className="relative lg:order-last">
            <div className="relative">
              <img 
                src={heroImage} 
                alt="Cortaí Platform Preview" 
                className="w-full max-w-lg mx-auto rounded-2xl shadow-2xl animate-float"
              />
              <div className="absolute -inset-4 bg-gradient-primary rounded-2xl blur-xl opacity-30 animate-pulse-glow" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;