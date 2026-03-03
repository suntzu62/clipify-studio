import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FloatingOrbs } from './FloatingOrbs';
import { AnimatedText } from './AnimatedText';

interface CTAProps {
  onGetStarted?: () => void;
  className?: string;
}

export const CTA = ({ onGetStarted, className }: CTAProps) => {
  return (
    <section className={cn('relative py-24 bg-gradient-hero text-white overflow-hidden', className)}>
      <FloatingOrbs variant="light" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm animate-float"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">
              Junte-se a milhares de criadores
            </span>
          </motion.div>

          {/* Heading */}
          <AnimatedText
            text="Pronto para transformar seus vídeos em clipes virais?"
            as="h2"
            className="text-4xl md:text-5xl font-bold leading-tight"
            highlightWords={{
              'virais?': 'underline decoration-wavy decoration-white/40',
            }}
          />

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed"
          >
            Comece gratuitamente hoje e veja como é fácil criar conteúdo que
            engaja e converte.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
              <Button
                size="lg"
                variant="secondary"
                className="text-base font-semibold shadow-xl btn-premium"
                onClick={onGetStarted}
              >
                Começar Gratuitamente
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
              <Button
                size="lg"
                variant="ghost"
                className="text-base font-semibold text-white hover:bg-white/10 border border-white/30"
              >
                Ver Demonstração
              </Button>
            </motion.div>
          </motion.div>

          {/* Trust Badge */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="text-sm text-white/70 pt-4"
          >
            Sem cartão de crédito necessário • Cancele quando quiser •
            Suporte em português
          </motion.p>
        </div>
      </div>
    </section>
  );
};
