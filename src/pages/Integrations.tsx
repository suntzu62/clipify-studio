import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Play, Settings as SettingsIcon, Video, Cable, Crown } from 'lucide-react';

const Integrations = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link to="/clip-lab" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="text-xl font-bold text-foreground">Cortaí</span>
            </Link>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">
                {user?.email}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:w-64 flex-shrink-0">
            <nav className="space-y-2">
              <Link
                to="/dashboard"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Play className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/projects"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Video className="w-5 h-5" />
                <span>Meus Projetos</span>
              </Link>
              <Link
                to="/billing"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Crown className="w-5 h-5" />
                <span>Plano</span>
              </Link>
              <Link
                to="/settings"
                className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <SettingsIcon className="w-5 h-5" />
                <span>Configurações</span>
              </Link>
              <Link
                to="/integrations"
                className="flex items-center space-x-3 px-3 py-2 rounded-md bg-primary/10 text-primary font-medium"
              >
                <Cable className="w-5 h-5" />
                <span>Integrações</span>
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 max-w-2xl">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Integrações
              </h1>
              <p className="text-muted-foreground">
                Conecte serviços externos para expandir funcionalidades
              </p>
            </div>

            <div className="space-y-6">
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle>Integrações em breve</CardTitle>
                  <CardDescription>
                    As integrações externas foram ocultadas até a configuração ficar pronta.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">
                    <Cable className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Quando a configuração estiver pronta, reativamos essa área.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Integrations;
