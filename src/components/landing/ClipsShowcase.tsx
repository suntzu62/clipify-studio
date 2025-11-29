import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Play, TrendingUp, Clock, Zap } from 'lucide-react';

interface ClipsShowcaseProps {
  className?: string;
}

const exampleClips = [
  {
    id: '1',
    title: 'Top Moment #1',
    duration: '45s',
    views: '127K',
    platform: 'TikTok',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=700&fit=crop',
    viralScore: 95,
  },
  {
    id: '2',
    title: 'Best Highlight',
    duration: '52s',
    views: '89K',
    platform: 'Instagram',
    thumbnail: 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=700&fit=crop',
    viralScore: 88,
  },
  {
    id: '3',
    title: 'Key Takeaway',
    duration: '38s',
    views: '156K',
    platform: 'YouTube',
    thumbnail: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&h=700&fit=crop',
    viralScore: 92,
  },
];

const stats = [
  { label: 'Clips Gerados', value: 50000, suffix: '+', duration: 2000 },
  { label: 'Minutos Processados', value: 150000, suffix: '+', duration: 2500 },
  { label: 'Criadores Ativos', value: 10000, suffix: '+', duration: 2200 },
  { label: 'Taxa de Satisfação', value: 98, suffix: '%', duration: 1800 },
];

export const ClipsShowcase = ({ className }: ClipsShowcaseProps) => {
  const [animatedStats, setAnimatedStats] = useState(stats.map(() => 0));
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!hasAnimated) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setHasAnimated(true);
            stats.forEach((stat, index) => {
              const increment = stat.value / (stat.duration / 16);
              let current = 0;
              const timer = setInterval(() => {
                current += increment;
                if (current >= stat.value) {
                  current = stat.value;
                  clearInterval(timer);
                }
                setAnimatedStats((prev) => {
                  const newStats = [...prev];
                  newStats[index] = Math.floor(current);
                  return newStats;
                });
              }, 16);
            });
            observer.disconnect();
          }
        },
        { threshold: 0.3 }
      );

      const element = document.getElementById('stats-showcase');
      if (element) observer.observe(element);

      return () => observer.disconnect();
    }
  }, [hasAnimated]);

  return (
    <section className={cn('py-24 bg-gradient-subtle', className)}>
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">
            <Zap className="w-3 h-3 mr-1" />
            IA em Ação
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Clipes virais criados em <span className="text-primary">segundos</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Veja exemplos reais de clips gerados pela nossa IA e as estatísticas impressionantes
          </p>
        </div>

        {/* Clips Grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
          {exampleClips.map((clip, index) => (
            <Card
              key={clip.id}
              className="group overflow-hidden hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-105"
              style={{
                animationDelay: `${index * 100}ms`,
                animation: 'fadeInUp 0.6s ease-out forwards',
              }}
            >
              <CardContent className="p-0">
                {/* Thumbnail */}
                <div className="relative aspect-[9/16] bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
                  <img
                    src={clip.thumbnail}
                    alt={clip.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"
                  />

                  {/* Play Overlay */}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                      <Play className="w-8 h-8 text-primary ml-1" fill="currentColor" />
                    </div>
                  </div>

                  {/* Viral Score Badge */}
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-success text-success-foreground shadow-lg">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      {clip.viralScore}% Viral
                    </Badge>
                  </div>

                  {/* Platform Badge */}
                  <div className="absolute top-3 left-3">
                    <Badge variant="secondary" className="shadow-lg">
                      {clip.platform}
                    </Badge>
                  </div>

                  {/* Stats Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <h3 className="text-white font-semibold mb-2">{clip.title}</h3>
                    <div className="flex items-center justify-between text-xs text-white/90">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {clip.duration}
                      </div>
                      <div className="flex items-center gap-1">
                        <Play className="w-3 h-3" />
                        {clip.views} views
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Animated Stats */}
        <div id="stats-showcase" className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm border hover:border-primary/50 transition-colors"
            >
              <div className="text-4xl md:text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
                {animatedStats[index].toLocaleString('pt-BR')}
                {stat.suffix}
              </div>
              <div className="text-sm text-muted-foreground font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
};
