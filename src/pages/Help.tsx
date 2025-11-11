import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import LazyFooter from '@/components/LazyFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowLeft,
  Search,
  BookOpen,
  MessageCircle,
  Mail,
  Video,
  Zap,
  CreditCard,
  Settings,
} from 'lucide-react';

const Help = () => {
  const categories = [
    {
      icon: Video,
      title: 'Começando',
      description: 'Aprenda o básico do Cortaí',
      articles: 5,
    },
    {
      icon: Zap,
      title: 'Processamento',
      description: 'Como funciona a IA',
      articles: 8,
    },
    {
      icon: CreditCard,
      title: 'Planos e Pagamento',
      description: 'Assinaturas e cobrança',
      articles: 6,
    },
    {
      icon: Settings,
      title: 'Configurações',
      description: 'Personalize sua experiência',
      articles: 4,
    },
  ];

  const popularQuestions = [
    {
      question: 'Como faço upload de um vídeo?',
      answer:
        'Você pode fazer upload de um vídeo de duas formas: 1) Cole a URL do YouTube no campo de input na página inicial, ou 2) Arraste e solte um arquivo de vídeo (MP4, MOV, AVI) diretamente. O vídeo será processado automaticamente.',
    },
    {
      question: 'Quanto tempo leva para processar um vídeo?',
      answer:
        'O tempo de processamento depende da duração do vídeo. Em média: vídeos de 30 minutos levam 2-3 minutos, vídeos de 1 hora levam 4-6 minutos. Você receberá notificações em tempo real sobre o progresso.',
    },
    {
      question: 'Posso editar os clipes gerados?',
      answer:
        'Sim! Você pode personalizar legendas (fonte, cor, tamanho, posição), ajustar o enquadramento, cortar início/fim de cada clipe, e adicionar efeitos. Acesse o editor clicando no clipe desejado.',
    },
    {
      question: 'Quais formatos de vídeo são aceitos?',
      answer:
        'Aceitamos os formatos mais comuns: MP4, MOV, AVI, MKV, WEBM. Os clipes são sempre exportados em MP4 no formato 9:16 (vertical), otimizado para redes sociais.',
    },
    {
      question: 'Como funciona o plano gratuito?',
      answer:
        'O plano gratuito permite processar até 10 minutos de vídeo por mês, com todas as funcionalidades básicas. Ideal para testar a plataforma. Faça upgrade para planos pagos para aumentar o limite.',
    },
    {
      question: 'Posso cancelar minha assinatura?',
      answer:
        'Sim! Você pode cancelar a qualquer momento através das Configurações > Plano. Seu acesso continuará até o final do período pago. Não há taxa de cancelamento.',
    },
    {
      question: 'Os vídeos ficam salvos para sempre?',
      answer:
        'Seus vídeos originais e clipes ficam armazenados por 30 dias após o processamento. Após esse período, são automaticamente deletados por questões de privacidade e segurança. Baixe os clipes que deseja manter!',
    },
    {
      question: 'Como funciona a publicação automática?',
      answer:
        'Conecte suas contas do TikTok, Instagram e YouTube nas Integrações. Depois, ao gerar clipes, você terá a opção de publicar diretamente com um clique. Você ainda pode revisar título, descrição e hashtags antes de postar.',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-16">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Central de Ajuda</h1>
          <p className="text-muted-foreground text-lg mb-8">
            Encontre respostas rápidas para suas dúvidas
          </p>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              placeholder="Pesquisar artigos, tutoriais, perguntas..."
              className="pl-12 h-14 text-base"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="max-w-6xl mx-auto mb-16">
          <h2 className="text-2xl font-semibold mb-6">Categorias</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((category, index) => {
              const Icon = category.icon;
              return (
                <Card
                  key={index}
                  className="hover:shadow-lg transition-all duration-300 cursor-pointer group"
                >
                  <CardHeader>
                    <div className="p-3 rounded-lg bg-primary/10 w-fit mb-3 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {category.articles} artigos
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Popular Questions */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl font-semibold mb-6">Perguntas Frequentes</h2>
          <Accordion type="single" collapsible className="space-y-4">
            {popularQuestions.map((item, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-card rounded-lg border-2 px-6 hover:border-primary/30 transition-colors"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-5">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Contact Options */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold mb-6 text-center">
            Ainda precisa de ajuda?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit mb-3">
                  <BookOpen className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-lg">Documentação</CardTitle>
                <CardDescription>
                  Guias detalhados e tutoriais
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Ler Docs
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit mb-3">
                  <MessageCircle className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-lg">Chat ao Vivo</CardTitle>
                <CardDescription>
                  Fale com nossa equipe
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Iniciar Chat
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit mb-3">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-lg">Email</CardTitle>
                <CardDescription>
                  Resposta em até 24 horas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <a href="mailto:support@cortai.com">Enviar Email</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <LazyFooter />
    </div>
  );
};

export default Help;
