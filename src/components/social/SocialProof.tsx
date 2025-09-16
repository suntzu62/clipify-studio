import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Star, TrendingUp, Shield, Zap, Heart } from 'lucide-react';

export const SocialProof = () => {
  const stats = [
    { icon: Users, label: '+2.000 criadores', sublabel: 'já confiam no Cortaí' },
    { icon: TrendingUp, label: '500M+ views', sublabel: 'geradas pelos nossos clipes' },
    { icon: Star, label: '4.9/5 estrelas', sublabel: 'avaliação média' }
  ];

  const guarantees = [
    { icon: Shield, text: 'Sem cartão de crédito' },
    { icon: Zap, text: 'Privacidade total' },
    { icon: Heart, text: 'Cancelamento fácil' }
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <Card className="bg-gradient-card border-0 shadow-card">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-3">
                  <stat.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-1">
                  {stat.label}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {stat.sublabel}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Guarantees */}
      <div className="flex flex-wrap justify-center gap-3">
        {guarantees.map((guarantee, index) => (
          <Badge 
            key={index} 
            variant="outline" 
            className="bg-green-50 border-green-200 text-green-700 px-3 py-1.5 text-sm"
          >
            <guarantee.icon className="w-4 h-4 mr-2" />
            {guarantee.text}
          </Badge>
        ))}
      </div>

      {/* Testimonial */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6 text-center">
          <div className="flex justify-center mb-3">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
            ))}
          </div>
          <blockquote className="text-foreground font-medium mb-3 italic">
            "O Cortaí revolucionou minha criação de conteúdo. Em minutos tenho vários Shorts prontos para postar!"
          </blockquote>
          <cite className="text-sm text-muted-foreground">
            - @creatorpro, 150K seguidores
          </cite>
        </CardContent>
      </Card>
    </div>
  );
};