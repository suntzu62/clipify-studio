import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

const Callback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const error = searchParams.get('error');

    if (error) {
      toast({
        title: 'Erro ao fazer login',
        description: 'Não foi possível fazer login com Google. Tente novamente.',
        variant: 'destructive',
      });
      navigate('/auth/login');
      return;
    }

    if (accessToken && refreshToken) {
      // Salvar tokens no localStorage
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);

      toast({
        title: 'Login realizado com sucesso!',
        description: 'Bem-vindo ao Cortaí',
      });

      // Redirecionar para dashboard e recarregar para atualizar o AuthContext
      window.location.href = '/dashboard';
    } else {
      toast({
        title: 'Erro ao fazer login',
        description: 'Tokens inválidos. Tente novamente.',
        variant: 'destructive',
      });
      navigate('/auth/login');
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Processando login...</h2>
        <p className="text-muted-foreground">Aguarde um momento</p>
      </div>
    </div>
  );
};

export default Callback;
