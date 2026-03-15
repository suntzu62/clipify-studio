import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2" role="alert">
      <WifiOff className="w-4 h-4" />
      Sem conexão com a internet. Algumas funcionalidades podem não funcionar.
    </div>
  );
};
