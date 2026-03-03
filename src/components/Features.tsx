import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Video,
  Scissors,
  Type,
  Upload,
  Zap,
  BarChart3,
  FileText,
  Clock,
  Target
} from "lucide-react";
import { TiltCard, MouseSpotlight, AnimatedText } from '@/components/landing';

const Features = () => {
  const features = [
    {
      icon: Video,
      title: "Transcrição Inteligente",
      description: "IA Whisper large-v3 para transcrição precisa em português e outros idiomas"
    },
    {
      icon: Scissors,
      title: "Clipes Automáticos",
      description: "8-12 clipes de 30-90s otimizados para cada vídeo longo, com legendas queimadas"
    },
    {
      icon: Type,
      title: "Textos Automáticos",
      description: "Títulos, descrições e hashtags gerados automaticamente para cada clipe"
    },
    {
      icon: Upload,
      title: "Upload Direto",
      description: "Publicação automática no YouTube Shorts e outras redes sociais"
    },
    {
      icon: FileText,
      title: "Blog Posts",
      description: "Artigos de 800-1200 palavras gerados automaticamente a partir do conteúdo"
    },
    {
      icon: Target,
      title: "Otimização Viral",
      description: "IA treinada para identificar os melhores trechos com potencial viral"
    },
    {
      icon: Clock,
      title: "Processamento Rápido",
      description: "Resultados em minutos, não horas. Pipeline otimizado para velocidade"
    },
    {
      icon: BarChart3,
      title: "Analytics Avançados",
      description: "Métricas detalhadas de performance e engajamento dos seus clipes"
    },
    {
      icon: Zap,
      title: "Pipeline Idempotente",
      description: "Jobs seguros com logs detalhados e sistema de filas robusto"
    }
  ];

  return (
    <section id="features" className="py-24 bg-gradient-card">
      <MouseSpotlight>
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <AnimatedText
              text="Recursos que fazem a diferença"
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
              Tecnologia de ponta para transformar seu conteúdo longo em dezenas de clipes virais
            </motion.p>
            {/* Decorative divider */}
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto h-[2px] w-24 bg-gradient-primary origin-center"
            />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{
                  delay: index * 0.08,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <TiltCard tiltDegree={10} glare>
                  <Card className="group glass-card glass-card-hover border-border/50 hover:border-primary/20 h-full transition-all duration-300">
                    <CardHeader className="text-center">
                      <motion.div
                        whileHover={{ rotate: [0, -10, 10, 0], scale: 1.15 }}
                        transition={{ duration: 0.4 }}
                        className="w-16 h-16 mx-auto rounded-xl bg-gradient-primary p-4 mb-4"
                      >
                        <feature.icon className="w-full h-full text-white" />
                      </motion.div>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-center">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </MouseSpotlight>
    </section>
  );
};

export default Features;
