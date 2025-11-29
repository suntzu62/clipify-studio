import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QuickCreate } from '@/components/QuickCreate';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowRight,
  Brain,
  Clock,
  Compass,
  Layers,
  ListCheck,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

const STRATEGY_PILLARS = [
  {
    title: 'Objetivo e CTA',
    description: 'Defina se o clipe é para awareness, leads ou venda e feche com um CTA visível.',
    icon: Target,
    points: ['CTA único e claro', 'Mensagem alinhada ao funil', 'Banner final com ação'],
  },
  {
    title: 'Formato certo',
    description: 'Escolha duração, ritmo e arte que entreguem retenção em mobile.',
    icon: Layers,
    points: ['30-60s para Reels/Shorts', 'Legendado com contraste', 'Cortes a cada 3-5s'],
  },
  {
    title: 'Sequência estratégica',
    description: 'Use uma linha narrativa para não perder o espectador no meio.',
    icon: Compass,
    points: ['Hook forte em 3s', 'Contexto rápido', 'Prova + CTA'],
  },
];

const PLAYBOOK_STEPS = [
  { label: '0-3s', title: 'Hook', description: 'Pergunta direta, estatística forte ou promessa clara.' },
  { label: '3-10s', title: 'Contexto', description: 'Explique o problema ou a oportunidade em 1 frase.' },
  { label: '10-40s', title: 'Valor', description: 'Entregue o conteúdo principal com cortes rápidos.' },
  { label: '40-60s', title: 'CTA e prova', description: 'Resumo + convite para próxima ação (link, bio, comentário).' },
];

const STRATEGY_TEMPLATES = [
  {
    title: 'Awareness rápido',
    focus: 'Hook + micro história + CTA leve',
    duration: '40-60s',
    platform: 'Reels / Shorts',
    tags: ['Hook forte', 'Legenda dinâmica', 'CTA visual'],
  },
  {
    title: 'Prova social',
    focus: 'Resultado real + bastidor + convite',
    duration: '35-55s',
    platform: 'TikTok / Reels',
    tags: ['Depoimento', 'Números na tela', 'CTA direto'],
  },
  {
    title: 'Conteúdo educativo',
    focus: '3 passos claros + benefício final',
    duration: '50-70s',
    platform: 'YouTube Shorts',
    tags: ['Passo a passo', 'Título em tela', 'Resumo final'],
  },
];

const QUALITY_CHECKLIST = [
  { title: 'Hook nos 3s', detail: 'Primeira fala responde “por que eu deveria ver isso agora?”.' },
  { title: 'Legendas legíveis', detail: 'Fonte >16px, contraste alto e sombra para fundos claros.' },
  { title: 'Cortes sem pausas', detail: 'Remova silêncios longos e mantenha movimento a cada 3-5s.' },
  { title: 'CTA persistente', detail: 'Banner no final e menção verbal da próxima ação.' },
  { title: 'Audio nivelado', detail: 'Volume uniforme e trilha baixa para não competir com a voz.' },
];

export default function ClipLab() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/10">
      {/* Top bar */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link to="/clip-lab" className="flex items-center space-x-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center group-hover:shadow-glow transition-all">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                  Cortaí
                </span>
                <span className="text-xs text-muted-foreground">Central de geração</span>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/projects">
                  Meus projetos
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-10 space-y-10">
        {/* Hero + QuickCreate */}
        <section className="grid gap-8 lg:grid-cols-2 items-start">
          <div className="space-y-6">
            <Badge variant="secondary" className="gap-1 w-fit">
              <Sparkles className="w-3 h-3" />
              Novo
            </Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold leading-tight">
                Geração de clipes organizada e estratégica
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Use um playbook claro: valide o link, configure cortes e legendas e aplique uma
                sequência que segura retenção até o CTA final.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {STRATEGY_PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <Card key={pillar.title} className="border-primary/15 bg-gradient-to-br from-background to-accent/10">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-primary" />
                        <CardTitle className="text-base">{pillar.title}</CardTitle>
                      </div>
                      <CardDescription className="text-sm">{pillar.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {pillar.points.map((point) => (
                        <div key={point} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                          <span>{point}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="gap-2" onClick={() => navigate('/projects')}>
                <Play className="w-4 h-4" />
                Ver projetos
              </Button>
              <Button variant="ghost" size="lg" className="gap-2" onClick={() => navigate('/dashboard')}>
                Voltar ao dashboard
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="lg:max-w-xl lg:ml-auto">
            <QuickCreate
              userId={user.id}
              getToken={getToken}
              onProjectCreated={(tempId) => navigate(`/projects/configure/${tempId}`)}
            />
          </div>
        </section>

        {/* Strategy templates */}
        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Frameworks rápidos
              </p>
              <h2 className="text-2xl font-bold">Escolha o modelo certo para o seu objetivo</h2>
              <p className="text-muted-foreground">
                Combine objetivo, plataforma e duração para não desperdiçar os primeiros segundos.
              </p>
            </div>
            <Badge variant="outline" className="gap-2">
              <Brain className="w-4 h-4" />
              Sugestões da IA
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {STRATEGY_TEMPLATES.map((template) => (
              <Card key={template.title} className="border-primary/20 hover:shadow-lg transition-all">
                <CardHeader className="space-y-1 pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary" />
                    {template.title}
                  </CardTitle>
                  <CardDescription>{template.focus}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-foreground">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    {template.duration}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Compass className="w-4 h-4" />
                    {template.platform}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {template.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Playbook timeline */}
        <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <Card className="border-primary/15">
            <CardHeader>
              <CardTitle className="text-xl">Playbook de retenção</CardTitle>
              <CardDescription>
                Estrutura pronta para planejar cortes antes de processar seus clipes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PLAYBOOK_STEPS.map((step) => (
                <div key={step.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                  <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                    {step.label}
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-dashed border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ListCheck className="w-4 h-4 text-primary" />
                Checklist de qualidade
              </CardTitle>
              <CardDescription>Confirme antes de rodar o pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {QUALITY_CHECKLIST.map((item) => (
                <div key={item.title} className="p-3 rounded-lg bg-accent/20">
                  <p className="font-medium text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
