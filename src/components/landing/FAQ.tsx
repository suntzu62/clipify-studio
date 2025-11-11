import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

interface FAQProps {
  className?: string;
}

const faqs = [
  {
    question: 'Como funciona o Cortai?',
    answer:
      'O Cortai usa inteligência artificial para analisar seu vídeo, identificar os momentos mais interessantes e criar clipes otimizados para redes sociais. Basta fazer upload do vídeo ou colar a URL do YouTube, e nossa IA faz o resto!',
  },
  {
    question: 'Quanto tempo leva para gerar os clipes?',
    answer:
      'Em média, levamos 3-5 minutos para processar um vídeo de 1 hora. Vídeos mais longos podem levar um pouco mais, mas você verá o progresso em tempo real e pode começar a baixar os primeiros clipes antes do processo terminar.',
  },
  {
    question: 'Posso editar os clipes gerados?',
    answer:
      'Sim! Você pode personalizar legendas (fonte, cor, posição), ajustar o enquadramento, cortar o início/fim de cada clipe, e muito mais. Nosso editor intuitivo permite que você deixe tudo do seu jeito.',
  },
  {
    question: 'Quais formatos de vídeo são suportados?',
    answer:
      'Aceitamos MP4, MOV, AVI, MKV e links do YouTube. Os clipes gerados sempre saem no formato 9:16 (vertical), otimizado para TikTok, Instagram Reels e YouTube Shorts.',
  },
  {
    question: 'Posso publicar direto nas redes sociais?',
    answer:
      'Sim! Integramos com TikTok, Instagram e YouTube para que você possa publicar seus clipes com um clique. Você também pode baixar os vídeos e fazer upload manualmente se preferir.',
  },
  {
    question: 'Existe limite de vídeos por mês?',
    answer:
      'Depende do seu plano. O plano Starter permite até 10 horas de vídeo por mês, o Pro até 50 horas, e o Business oferece uso ilimitado. Veja todos os detalhes na página de Planos.',
  },
  {
    question: 'Vocês guardam meus vídeos?',
    answer:
      'Seus vídeos ficam armazenados por 30 dias após o processamento para que você possa acessar seus clipes a qualquer momento. Depois desse período, são automaticamente deletados por questões de privacidade e segurança.',
  },
  {
    question: 'Posso cancelar a qualquer momento?',
    answer:
      'Sim! Não há fidelidade. Você pode cancelar seu plano a qualquer momento e continuará tendo acesso até o final do período pago.',
  },
];

export const FAQ = ({ className }: FAQProps) => {
  return (
    <section className={cn('py-24 bg-gradient-subtle', className)}>
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Perguntas Frequentes
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Tudo que você precisa saber sobre o Cortai
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-background rounded-lg border-2 px-6 hover:border-primary/30 transition-colors"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-5">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};
