import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CTAProps {
  onGetStarted?: () => void;
  className?: string;
}

export const CTA = ({ onGetStarted, className }: CTAProps) => {
  return (
    <section className={cn('py-24 bg-gradient-hero text-white', className)}>
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">
              Junte-se a milhares de criadores
            </span>
          </div>

          {/* Heading */}
          <h2 className="text-4xl md:text-5xl font-bold leading-tight">
            Pronto para transformar seus vídeos em{' '}
            <span className="underline decoration-wavy decoration-white/40">
              clipes virais
            </span>
            ?
          </h2>

          {/* Description */}
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed">
            Comece gratuitamente hoje e veja como é fácil criar conteúdo que
            engaja e converte.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              variant="secondary"
              className="text-base font-semibold shadow-xl hover:scale-105 transition-transform"
              onClick={onGetStarted}
            >
              Começar Gratuitamente
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-base font-semibold text-white hover:bg-white/10 border border-white/30"
            >
              Ver Demonstração
            </Button>
          </div>

          {/* Trust Badge */}
          <p className="text-sm text-white/70 pt-4">
            Sem cartão de crédito necessário • Cancele quando quiser •
            Suporte em português
          </p>
        </div>
      </div>
    </section>
  );
};
