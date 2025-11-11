import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import LazyFooter from '@/components/LazyFooter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Terms = () => {
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Termos de Uso</h1>
          <p className="text-muted-foreground text-lg">
            Última atualização: 8 de novembro de 2024
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao acessar e usar o Cortaí, você concorda em cumprir e estar vinculado a estes
              Termos de Uso. Se você não concordar com algum termo, não utilize nosso serviço.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Descrição do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              O Cortaí é uma plataforma de inteligência artificial que permite:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Converter vídeos longos em clipes curtos otimizados para redes sociais</li>
              <li>Gerar legendas automáticas e personalizáveis</li>
              <li>Identificar automaticamente os melhores momentos do vídeo</li>
              <li>Publicar diretamente em plataformas sociais (TikTok, Instagram, YouTube)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Conta de Usuário</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Para usar o Cortaí, você deve:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Ter pelo menos 18 anos de idade</li>
              <li>Fornecer informações precisas e completas durante o registro</li>
              <li>Manter a confidencialidade de suas credenciais de acesso</li>
              <li>Notificar-nos imediatamente sobre qualquer uso não autorizado de sua conta</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Uso Aceitável</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Você concorda em NÃO:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Fazer upload de conteúdo que viole direitos autorais de terceiros</li>
              <li>Processar vídeos com conteúdo ilegal, ofensivo ou prejudicial</li>
              <li>Usar o serviço para spam, phishing ou outras atividades maliciosas</li>
              <li>Tentar contornar limitações técnicas ou de uso</li>
              <li>Revender ou redistribuir o serviço sem autorização</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Propriedade Intelectual</h2>
            <p className="text-muted-foreground leading-relaxed">
              Você mantém todos os direitos sobre o conteúdo que faz upload. Ao usar o Cortaí,
              você nos concede uma licença limitada para processar seus vídeos e gerar os clipes.
              Nós não reivindicamos propriedade sobre seu conteúdo.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Planos e Pagamentos</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Oferecemos diferentes planos de assinatura:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Cobrança recorrente mensal ou anual</li>
              <li>Você pode cancelar a qualquer momento</li>
              <li>Não oferecemos reembolsos parciais para cancelamentos</li>
              <li>Preços podem mudar com aviso prévio de 30 dias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Limitação de Responsabilidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              O Cortaí é fornecido "como está". Não garantimos que o serviço será ininterrupto
              ou livre de erros. Não somos responsáveis por perdas ou danos resultantes do uso
              do serviço.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Modificações dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos modificar estes termos a qualquer momento. Mudanças significativas serão
              notificadas por email. O uso continuado do serviço após mudanças constitui
              aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Rescisão</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos suspender ou encerrar sua conta se você violar estes termos. Você pode
              encerrar sua conta a qualquer momento através das configurações.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para questões sobre estes termos, entre em contato:
            </p>
            <p className="text-muted-foreground mt-2">
              Email: <a href="mailto:legal@cortai.com" className="text-primary hover:underline">legal@cortai.com</a>
            </p>
          </section>
        </div>
      </main>

      <LazyFooter />
    </div>
  );
};

export default Terms;
