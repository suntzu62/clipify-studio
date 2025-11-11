import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import LazyFooter from '@/components/LazyFooter';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';

const Privacy = () => {
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
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold">Política de Privacidade</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Última atualização: 8 de novembro de 2024
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introdução</h2>
            <p className="text-muted-foreground leading-relaxed">
              No Cortaí, levamos sua privacidade a sério. Esta política descreve como coletamos,
              usamos, armazenamos e protegemos suas informações pessoais.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Informações que Coletamos</h2>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.1 Informações de Conta</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Email e senha (criptografada)</li>
              <li>Nome e foto de perfil (opcional)</li>
              <li>Informações de pagamento (processadas por terceiros seguros)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Conteúdo</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Vídeos que você faz upload ou URLs que você fornece</li>
              <li>Clipes gerados pela nossa IA</li>
              <li>Preferências de edição e configurações</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.3 Dados de Uso</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Informações de dispositivo e navegador</li>
              <li>Endereço IP e localização aproximada</li>
              <li>Páginas visitadas e ações realizadas</li>
              <li>Tempo de processamento e uso de recursos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Como Usamos suas Informações</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Utilizamos seus dados para:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Fornecer e melhorar nossos serviços</li>
              <li>Processar seus vídeos e gerar clipes</li>
              <li>Gerenciar sua conta e assinatura</li>
              <li>Enviar notificações sobre o serviço</li>
              <li>Treinar e melhorar nossos modelos de IA</li>
              <li>Detectar e prevenir fraudes</li>
              <li>Cumprir obrigações legais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Armazenamento de Dados</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Armazenamento de vídeos:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Vídeos originais são armazenados temporariamente durante o processamento</li>
              <li>Clipes gerados ficam disponíveis por 30 dias</li>
              <li>Após 30 dias, todos os vídeos são automaticamente deletados</li>
              <li>Você pode deletar vídeos manualmente a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Compartilhamento de Dados</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Compartilhamos seus dados apenas nas seguintes situações:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Provedores de Serviço:</strong> AWS, Stripe, analytics</li>
              <li><strong>Redes Sociais:</strong> Apenas quando você autoriza publicação</li>
              <li><strong>Requisitos Legais:</strong> Se exigido por lei ou autoridades</li>
              <li><strong>Nunca vendemos</strong> seus dados a terceiros</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Segurança</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Implementamos medidas de segurança incluindo:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Criptografia SSL/TLS para todas as comunicações</li>
              <li>Senhas hasheadas com bcrypt</li>
              <li>Servidores em datacenters seguros (AWS)</li>
              <li>Backups regulares e criptografados</li>
              <li>Monitoramento 24/7 para atividades suspeitas</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Seus Direitos</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Você tem direito a:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Acessar:</strong> Solicitar cópia de seus dados</li>
              <li><strong>Corrigir:</strong> Atualizar informações incorretas</li>
              <li><strong>Deletar:</strong> Excluir sua conta e dados</li>
              <li><strong>Exportar:</strong> Baixar seus vídeos e dados</li>
              <li><strong>Optar por não receber:</strong> Emails de marketing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Usamos cookies para melhorar sua experiência. Você pode desabilitar cookies nas
              configurações do navegador, mas isso pode afetar a funcionalidade do site.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Crianças</h2>
            <p className="text-muted-foreground leading-relaxed">
              Nosso serviço não é destinado a menores de 18 anos. Não coletamos intencionalmente
              informações de crianças.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Mudanças nesta Política</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos atualizar esta política ocasionalmente. Notificaremos sobre mudanças
              significativas por email ou através do site.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para questões sobre privacidade:
            </p>
            <p className="text-muted-foreground mt-2">
              Email: <a href="mailto:privacy@cortai.com" className="text-primary hover:underline">privacy@cortai.com</a>
            </p>
          </section>
        </div>
      </main>

      <LazyFooter />
    </div>
  );
};

export default Privacy;
