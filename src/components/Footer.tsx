import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, Twitter, Linkedin, Mail, Youtube } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background">
      <div className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="text-xl font-bold">Cortaí</span>
            </div>
            <p className="text-background/70 text-sm">
              Transforme seus vídeos longos em conteúdo viral com nossa IA avançada. 
              Mais alcance, menos trabalho.
            </p>
            <div className="flex space-x-4">
              <Button variant="ghost" size="icon" className="hover:bg-background/10">
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="hover:bg-background/10">
                <Linkedin className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="hover:bg-background/10">
                <Youtube className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="hover:bg-background/10">
                <Github className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Product */}
          <div className="space-y-4">
            <h3 className="font-semibold">Produto</h3>
            <ul className="space-y-2 text-sm text-background/70">
              <li><a href="#features" className="hover:text-background transition-colors">Recursos</a></li>
              <li><a href="#pricing" className="hover:text-background transition-colors">Preços</a></li>
              <li><a href="#api" className="hover:text-background transition-colors">API</a></li>
              <li><a href="#roadmap" className="hover:text-background transition-colors">Roadmap</a></li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h3 className="font-semibold">Empresa</h3>
            <ul className="space-y-2 text-sm text-background/70">
              <li><a href="#about" className="hover:text-background transition-colors">Sobre</a></li>
              <li><a href="#blog" className="hover:text-background transition-colors">Blog</a></li>
              <li><a href="#careers" className="hover:text-background transition-colors">Carreiras</a></li>
              <li><a href="#contact" className="hover:text-background transition-colors">Contato</a></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="space-y-4">
            <h3 className="font-semibold">Newsletter</h3>
            <p className="text-sm text-background/70">
              Receba dicas de criação de conteúdo e novidades da plataforma.
            </p>
            <div className="flex gap-2">
              <Input 
                placeholder="Seu email" 
                className="bg-background/10 border-background/20 text-background placeholder:text-background/50"
              />
              <Button variant="secondary" size="icon">
                <Mail className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-background/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <p className="text-sm text-background/70">
            © 2024 Cortaí. Todos os direitos reservados.
          </p>
          <div className="flex space-x-6 text-sm text-background/70">
            <a href="#privacy" className="hover:text-background transition-colors">Privacidade</a>
            <a href="#terms" className="hover:text-background transition-colors">Termos</a>
            <a href="#cookies" className="hover:text-background transition-colors">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;