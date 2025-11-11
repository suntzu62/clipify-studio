import { CheckCircle2, XCircle, AlertCircle, Info, Loader } from 'lucide-react';
import { toast } from 'sonner';

interface ToastOptions {
  title: string;
  description?: string;
  duration?: number;
}

export const showToast = {
  success: ({ title, description, duration = 4000 }: ToastOptions) => {
    toast.success(title, {
      description,
      duration,
      icon: <CheckCircle2 className="w-5 h-5 text-success" />,
      className: 'border-success/20 bg-success/10',
    });
  },

  error: ({ title, description, duration = 5000 }: ToastOptions) => {
    toast.error(title, {
      description,
      duration,
      icon: <XCircle className="w-5 h-5 text-destructive" />,
      className: 'border-destructive/20 bg-destructive/10',
    });
  },

  warning: ({ title, description, duration = 4000 }: ToastOptions) => {
    toast.warning(title, {
      description,
      duration,
      icon: <AlertCircle className="w-5 h-5 text-warning" />,
      className: 'border-warning/20 bg-warning/10',
    });
  },

  info: ({ title, description, duration = 4000 }: ToastOptions) => {
    toast.info(title, {
      description,
      duration,
      icon: <Info className="w-5 h-5 text-info" />,
      className: 'border-info/20 bg-info/10',
    });
  },

  loading: ({ title, description }: ToastOptions) => {
    return toast.loading(title, {
      description,
      icon: <Loader className="w-5 h-5 animate-spin text-primary" />,
      className: 'border-primary/20 bg-primary/10',
    });
  },

  promise: <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return toast.promise(promise, {
      loading,
      success: (data) => ({
        title: typeof success === 'function' ? success(data) : success,
        icon: <CheckCircle2 className="w-5 h-5 text-success" />,
        className: 'border-success/20 bg-success/10',
      }),
      error: (err) => ({
        title: typeof error === 'function' ? error(err) : error,
        icon: <XCircle className="w-5 h-5 text-destructive" />,
        className: 'border-destructive/20 bg-destructive/10',
      }),
    });
  },
};

// Example usage:
/*
import { showToast } from '@/components/feedback/CustomToast';

// Success
showToast.success({
  title: 'Vídeo processado!',
  description: '8 clipes foram gerados com sucesso',
});

// Error
showToast.error({
  title: 'Erro ao fazer upload',
  description: 'Por favor, tente novamente',
});

// Loading
const toastId = showToast.loading({
  title: 'Processando vídeo...',
  description: 'Isso pode levar alguns minutos',
});
// Later: toast.dismiss(toastId);

// Promise
showToast.promise(
  processVideo(),
  {
    loading: 'Processando vídeo...',
    success: 'Vídeo processado com sucesso!',
    error: 'Erro ao processar vídeo',
  }
);
*/
