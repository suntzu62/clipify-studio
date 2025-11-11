import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import LazyFooter from '@/components/LazyFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Sparkles, Bug, Zap, Package } from 'lucide-react';

const Changelog = () => {
  const updates = [
    {
      version: '2.1.0',
      date: '8 de Novembro, 2024',
      badge: 'Novo',
      badgeVariant: 'default' as const,
      changes: [
        {
          type: 'feature',
          icon: Sparkles,
          title: 'Dashboard Cockpit',
          description: 'Novo dashboard com métricas em tempo real, cards de status e projetos recentes.',
        },
        {
          type: 'feature',
          icon: Sparkles,
          title: 'Landing Page Completa',
          description: 'Nova landing com depoimentos, FAQ, logo strip e CTA melhorado.',
        },
        {
          type: 'improvement',
          icon: Zap,
          title: 'Design System Expandido',
          description: 'Novos estados (success, warning, info), escala de cinzas e gradientes.',
        },
        {
          type: 'improvement',
          icon: Zap,
          title: 'Navbar Evoluído',
          description: 'Menu mobile melhorado, quick actions e indicador de plano.',
        },
      ],
    },
    {
      version: '2.0.0',
      date: '1 de Novembro, 2024',
      badge: 'Major',
      badgeVariant: 'default' as const,
      changes: [
        {
          type: 'feature',
          icon: Sparkles,
          title: 'Modal de Clipe Acessível',
          description: 'Novo modal com ARIA labels, botões de download e compartilhamento social.',
        },
        {
          type: 'feature',
          icon: Sparkles,
          title: 'Progresso em Tempo Real',
          description: 'SSE streaming para acompanhar processamento ao vivo com etapas detalhadas.',
        },
        {
          type: 'improvement',
          icon: Zap,
          title: 'Performance 40% Mais Rápida',
          description: 'Otimizações no FFmpeg: preset ultrafast, concorrência controlada, batch size 8.',
        },
        {
          type: 'fix',
          icon: Bug,
          title: 'Correção de Avisos de Erro',
          description: 'Removidos avisos alarmantes genéricos, mantendo apenas mensagens específicas.',
        },
      ],
    },
    {
      version: '1.5.2',
      date: '20 de Outubro, 2024',
      changes: [
        {
          type: 'improvement',
          icon: Zap,
          title: 'Circuit Breaker Melhorado',
          description: 'Configurações mais tolerantes para evitar fallback prematuro para polling.',
        },
        {
          type: 'fix',
          icon: Bug,
          title: 'Correção em Detecção de Cenas',
          description: 'Melhorada precisão na identificação de mudanças de cena.',
        },
      ],
    },
    {
      version: '1.5.0',
      date: '10 de Outubro, 2024',
      badge: 'Feature',
      badgeVariant: 'secondary' as const,
      changes: [
        {
          type: 'feature',
          icon: Sparkles,
          title: 'Legendas Personalizáveis',
          description: 'Escolha fonte, cor, tamanho e posição das legendas em cada clipe.',
        },
        {
          type: 'feature',
          icon: Sparkles,
          title: 'Integração com Redes Sociais',
          description: 'Publique diretamente no TikTok, Instagram e YouTube com um clique.',
        },
        {
          type: 'improvement',
          icon: Zap,
          title: 'Análise de Sentiment',
          description: 'IA agora detecta momentos emocionalmente impactantes.',
        },
      ],
    },
    {
      version: '1.0.0',
      date: '1 de Setembro, 2024',
      badge: 'Lançamento',
      badgeVariant: 'secondary' as const,
      changes: [
        {
          type: 'feature',
          icon: Package,
          title: 'Lançamento Público',
          description: 'Cortaí agora está disponível para todos! Transforme vídeos em clipes virais com IA.',
        },
      ],
    },
  ];

  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case 'feature':
        return 'text-primary';
      case 'improvement':
        return 'text-info';
      case 'fix':
        return 'text-success';
      default:
        return 'text-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-16 max-w-4xl">
        {/* Back Button */}
        <Link to="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Changelog</h1>
          <p className="text-muted-foreground text-lg">
            Acompanhe todas as novidades, melhorias e correções do Cortaí
          </p>
        </div>

        {/* Updates Timeline */}
        <div className="space-y-12">
          {updates.map((update, updateIndex) => (
            <div key={updateIndex} className="relative">
              {/* Timeline Line */}
              {updateIndex < updates.length - 1 && (
                <div className="absolute left-5 top-16 bottom-0 w-px bg-border" />
              )}

              <Card className="border-2">
                <CardContent className="p-6">
                  {/* Version Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-full bg-primary/10">
                        <Package className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-bold">v{update.version}</h2>
                          {update.badge && (
                            <Badge variant={update.badgeVariant}>
                              {update.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {update.date}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Changes List */}
                  <div className="space-y-4">
                    {update.changes.map((change, changeIndex) => {
                      const Icon = change.icon;
                      return (
                        <div
                          key={changeIndex}
                          className="flex gap-4 p-4 rounded-lg bg-gradient-subtle hover:bg-accent/50 transition-colors"
                        >
                          <div className={`flex-shrink-0 ${getChangeTypeColor(change.type)}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">{change.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {change.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-16 text-center p-8 rounded-lg bg-gradient-subtle border-2 border-dashed">
          <p className="text-muted-foreground mb-4">
            Tem sugestões de features? Encontrou um bug?
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" asChild>
              <a href="mailto:feedback@cortai.com">Enviar Feedback</a>
            </Button>
            <Button asChild>
              <Link to="/help">Central de Ajuda</Link>
            </Button>
          </div>
        </div>
      </main>

      <LazyFooter />
    </div>
  );
};

export default Changelog;
