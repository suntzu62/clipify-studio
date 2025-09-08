import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@clerk/clerk-react';
import { useMemo, useState } from 'react';

export default function Integrations() {
  const { getToken } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const startUrlBase = useMemo(() => `${supabaseUrl}/functions/v1/yt-oauth-start`, [supabaseUrl]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = await getToken();
      const url = `${startUrlBase}?token=${encodeURIComponent(token || '')}`;
      window.location.href = url;
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Integrações</h1>
          <p className="text-muted-foreground">Conecte sua conta do YouTube para publicar seus clipes.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>YouTube</CardTitle>
            <CardDescription>Permita o upload via API (escopo youtube.upload).</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Redirecionando…' : 'Conectar YouTube'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

