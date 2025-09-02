import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground text-lg font-bold">C</span>
            </div>
            <span className="text-xl font-bold">Cortaí</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link to="/#features" className="text-foreground/80 hover:text-foreground transition-colors">
              Recursos
            </Link>
            <Link to="/#pricing" className="text-foreground/80 hover:text-foreground transition-colors">
              Preços
            </Link>
            <Link to="/#how-it-works" className="text-foreground/80 hover:text-foreground transition-colors">
              Como Funciona
            </Link>
          </nav>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="ghost">Entrar</Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button>Comece Grátis</Button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link to="/dashboard">
                <Button variant="ghost">Dashboard</Button>
              </Link>
              <Link to="/projects">
                <Button variant="ghost">Projetos</Button>
              </Link>
              <Link to="/billing">
                <Button variant="ghost">Billing</Button>
              </Link>
              <UserButton />
            </SignedIn>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden"
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 py-4 border-t">
            <nav className="flex flex-col space-y-4">
              <Link 
                to="/#features" 
                className="text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Recursos
              </Link>
              <Link 
                to="/#pricing" 
                className="text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Preços
              </Link>
              <Link 
                to="/#how-it-works" 
                className="text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Como Funciona
              </Link>
              
              <div className="flex flex-col space-y-2 pt-4 border-t">
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button variant="ghost" className="w-full justify-start">
                      Entrar
                    </Button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <Button className="w-full justify-start">
                      Comece Grátis
                    </Button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn>
                  <Link to="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start">
                      Dashboard
                    </Button>
                  </Link>
                  <Link to="/projects" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start">
                      Projetos
                    </Button>
                  </Link>
                  <Link to="/billing" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start">
                      Billing
                    </Button>
                  </Link>
                  <div className="px-3 py-2">
                    <UserButton />
                  </div>
                </SignedIn>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;