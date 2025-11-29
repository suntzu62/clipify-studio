import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Menu,
  X,
  User,
  LogOut,
  Settings,
  CreditCard,
  HelpCircle,
  Zap,
  Play,
  Video,
  Sparkles,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Navigation routes for easy AB testing and management
const NAVIGATION_ROUTES = [
  { href: '/#features', label: 'Recursos' },
  { href: '/#pricing', label: 'Preços' },
  { href: '/#how-it-works', label: 'Como Funciona' },
  { href: '/#faq', label: 'FAQ' },
];

const DASHBOARD_ROUTES = [
  { href: '/dashboard', label: 'Dashboard', icon: Play },
  { href: '/projects', label: 'Meus Projetos', icon: Video },
  { href: '/billing', label: 'Planos', icon: CreditCard },
];

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const getUserInitials = () => {
    if (!user?.email) return 'U';
    return user.email.charAt(0).toUpperCase();
  };

  // Mock user plan - replace with actual plan from API
  const userPlan = 'Free'; // Could be 'Free', 'Pro', 'Business'

  const handleGetStarted = () => {
    navigate('/auth/register');
  };

  return (
    <header className="bg-background/80 backdrop-blur-md border-b sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to={user ? '/clip-lab' : '/'} className="flex items-center space-x-2 group">
            <div className="h-8 w-8 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:shadow-glow transition-shadow">
              <span className="text-primary-foreground text-lg font-bold">C</span>
            </div>
            <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Cortaí
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            {NAVIGATION_ROUTES.map((route) => (
              <a
                key={route.href}
                href={route.href}
                className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-accent rounded-md transition-colors"
              >
                {route.label}
              </a>
            ))}
          </nav>

          {/* Desktop Auth Buttons */}
          <div className="hidden lg:flex items-center space-x-3">
            {!user ? (
              <>
                <Link to="/auth/login">
                  <Button variant="ghost">Entrar</Button>
                </Link>
                <Button variant="hero" onClick={handleGetStarted}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Começar Grátis
                </Button>
              </>
            ) : (
              <>
                {/* Dashboard Quick Links */}
                {DASHBOARD_ROUTES.map((route) => (
                  <Link key={route.href} to={route.href} className="hidden xl:block">
                    <Button variant="ghost" size="sm">
                      {route.label}
                    </Button>
                  </Link>
                ))}

                {/* Plan Badge */}
                {userPlan !== 'Free' && (
                  <Badge
                    variant="secondary"
                    className="hidden md:flex gap-1 bg-gradient-primary text-primary-foreground"
                  >
                    <Crown className="w-3 h-3" />
                    {userPlan}
                  </Badge>
                )}

                {/* User Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-10 w-10 rounded-full ring-2 ring-primary/20 hover:ring-primary/40 transition-all"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src="" alt={user.email || ''} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                      {/* Notification dot */}
                      <span className="absolute top-0 right-0 h-2 w-2 bg-success rounded-full border-2 border-background"></span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">Minha Conta</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                        {userPlan && (
                          <Badge variant="outline" className="mt-1 w-fit text-xs">
                            Plano {userPlan}
                          </Badge>
                        )}
                      </div>
                    </DropdownMenuLabel>

                    <DropdownMenuSeparator />

                    {/* Quick Actions */}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        Ações Rápidas
                      </DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/dashboard" className="flex items-center cursor-pointer">
                          <Play className="mr-2 h-4 w-4" />
                          <span>Dashboard</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/projects" className="flex items-center cursor-pointer">
                          <Video className="mr-2 h-4 w-4" />
                          <span>Meus Projetos</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/integrations" className="flex items-center cursor-pointer">
                          <Zap className="mr-2 h-4 w-4" />
                          <span>Integrações</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />

                    {/* Settings */}
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <Link to="/settings" className="flex items-center cursor-pointer">
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Configurações</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/billing" className="flex items-center cursor-pointer">
                          <CreditCard className="mr-2 h-4 w-4" />
                          <span>Planos e Pagamento</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/help" className="flex items-center cursor-pointer">
                          <HelpCircle className="mr-2 h-4 w-4" />
                          <span>Central de Ajuda</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() => signOut()}
                      className="cursor-pointer text-destructive focus:text-destructive"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sair</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="lg:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <div className="flex flex-col h-full">
                  {/* User Info (if logged in) */}
                  {user && (
                    <div className="pb-4 border-b">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src="" alt={user.email || ''} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                            {getUserInitials()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.email}</p>
                          <Badge variant="outline" className="mt-1 text-xs">
                            Plano {userPlan}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mobile Navigation */}
                  <nav className="flex-1 py-4 space-y-1">
                    {/* Main Routes */}
                    <div className="space-y-1">
                      {NAVIGATION_ROUTES.map((route) => (
                        <a
                          key={route.href}
                          href={route.href}
                          className="flex items-center px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-accent rounded-md transition-colors"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          {route.label}
                        </a>
                      ))}
                    </div>

                    {/* Dashboard Routes (if logged in) */}
                    {user && (
                      <>
                        <div className="h-px bg-border my-4" />
                        <div className="space-y-1">
                          {DASHBOARD_ROUTES.map((route) => {
                            const Icon = route.icon;
                            return (
                              <Link
                                key={route.href}
                                to={route.href}
                                className="flex items-center px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-accent rounded-md transition-colors"
                                onClick={() => setIsMobileMenuOpen(false)}
                              >
                                <Icon className="mr-3 h-4 w-4" />
                                {route.label}
                              </Link>
                            );
                          })}
                        </div>

                        <div className="h-px bg-border my-4" />

                        <Link
                          to="/settings"
                          className="flex items-center px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-accent rounded-md transition-colors"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <Settings className="mr-3 h-4 w-4" />
                          Configurações
                        </Link>
                      </>
                    )}
                  </nav>

                  {/* Mobile Auth Buttons */}
                  <div className="pt-4 border-t space-y-2">
                    {!user ? (
                      <>
                        <Link to="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                          <Button variant="outline" className="w-full">
                            Entrar
                          </Button>
                        </Link>
                        <Button
                          variant="hero"
                          className="w-full"
                          onClick={() => {
                            handleGetStarted();
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Começar Grátis
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          signOut();
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
