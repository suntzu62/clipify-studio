import { useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-950 to-gray-900">
      <div className="text-center px-6 max-w-md">
        <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-4">
          404
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Página não encontrada
        </h1>
        <p className="text-white/60 mb-8">
          A página <code className="text-purple-400 bg-white/5 px-2 py-0.5 rounded text-sm">{location.pathname}</code> não existe ou foi movida.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10">
            <Link to="/" >
              <Home className="w-4 h-4 mr-2" />
              Início
            </Link>
          </Button>
          <Button asChild className="bg-purple-600 hover:bg-purple-700 text-white">
            <Link to="/dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Ir ao Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
