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
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground">
            Recursos que fazem a diferença
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Tecnologia de ponta para transformar seu conteúdo longo em dezenas de clipes virais
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="group hover:shadow-xl transition-all duration-300 hover:scale-105 border-border/50 hover:border-primary/20"
            >
              <CardHeader className="text-center">
                <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-primary p-4 mb-4 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-full h-full text-white" />
                </div>
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
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;