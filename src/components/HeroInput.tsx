import { useEffect, useRef, useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Play, Youtube } from 'lucide-react';
import posthog from 'posthog-js';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import { enqueueFromUrl, type Job } from '@/lib/jobs-api';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { saveUserJob } from '@/lib/storage';

export interface HeroInputProps {
  className?: string;
  onOpenDemo: () => void;
  prefillUrl?: string | null;
}

const DEMO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function isValidYoutubeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
      if (host === 'youtu.be') return url.pathname.length > 1;
      if (url.pathname.startsWith('/watch')) return !!url.searchParams.get('v');
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2]?.length > 0;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeYoutubeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.replace('/', '');
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (host.endsWith('youtube.com') && url.pathname.startsWith('/shorts/')) {
      const id = url.pathname.split('/')[2];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

export function HeroInput({ className, onOpenDemo, prefillUrl }: HeroInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validFlash, setValidFlash] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const { isSignedIn, getToken } = useAuth();
  const { openSignIn } = useClerk();
  const { user } = useUser();

  useEffect(() => {
    // Retry after login
    const pending = localStorage.getItem('cortai:pendingHeroUrl');
    if (isSignedIn && pending) {
      localStorage.removeItem('cortai:pendingHeroUrl');
      void handleSubmitInternal(pending);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (prefillUrl && isValidYoutubeUrl(prefillUrl)) {
      setUrl(prefillUrl);
      setError(null);
      setSuccess('Link ok!');
      flashValid();
      requestAnimationFrame(() => submitBtnRef.current?.focus());
    }
  }, [prefillUrl]);

  const flashValid = () => {
    setValidFlash(true);
    setTimeout(() => setValidFlash(false), 1000);
  };

  const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const normalized = normalizeYoutubeUrl(text.trim());
    if (isValidYoutubeUrl(normalized)) {
      setUrl(normalized);
      setError(null);
      setSuccess('Link ok!');
      flashValid();
      // Focus the submit button so Enter triggers submit
      requestAnimationFrame(() => submitBtnRef.current?.focus());
    } else {
      setError('Esse link não parece do YouTube');
      setSuccess(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await handleSubmitInternal(url);
  };

  const handleSubmitInternal = async (rawUrl: string) => {
    const value = rawUrl.trim();
    if (!isValidYoutubeUrl(value)) {
      setError('Esse link não parece do YouTube');
      setSuccess(null);
      try { posthog.capture('hero validation_error', { reason: 'invalid_url' }); } catch {}
      return;
    }

    setError(null);
    setSuccess(null);
    try { posthog.capture('hero submit', { source: 'landing' }); } catch {}

    if (!isSignedIn) {
      localStorage.setItem('cortai:pendingHeroUrl', value);
      await openSignIn({
        afterSignInUrl: window.location.pathname,
        // @ts-ignore - openSignIn may accept modal option
        modal: true,
      });
      return;
    }

    try {
      setLoading(true);
      const tokenProvider = async () => await getToken({ template: 'supabase' });
      const { jobId } = await enqueueFromUrl(normalizeYoutubeUrl(value), tokenProvider);

      // Save minimal job to storage for ProjectDetail
      if (user?.id) {
        const job: Job = {
          id: jobId,
          youtubeUrl: normalizeYoutubeUrl(value),
          status: 'queued',
          progress: 0,
          createdAt: new Date().toISOString(),
          neededMinutes: 10,
        };
        saveUserJob(user.id, job);
      }

      navigate(`/projects/${jobId}`);
    } catch (e: any) {
      toast({ title: 'Falha ao criar pipeline', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className} aria-describedby="yt-help">
      <Label htmlFor="yt" className="mb-2 block">Cole o link do YouTube</Label>
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="yt"
            type="url"
            placeholder="https://youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handlePaste}
            className={`h-14 text-lg pl-10 placeholder-caret-blink ${validFlash ? 'ring-2 ring-green-500' : ''}`}
            aria-invalid={!!error}
            aria-describedby="yt-help"
          />
        </div>
        <Button ref={submitBtnRef} type="submit" className="h-14 px-6" disabled={loading} aria-label="Gerar clipes agora">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
          Gerar clipes agora
        </Button>
      </div>
      <p id="yt-help" className="mt-1 text-xs text-muted-foreground">Exemplo: https://youtube.com/watch?v=…</p>
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      {success && <p className="mt-2 text-sm text-green-600" role="status">{success}</p>}

      <div className="mt-3 flex items-center gap-4 text-sm">
        <button type="button" onClick={() => { try { posthog.capture('hero demo_open'); } catch {} onOpenDemo(); }} className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Ver demo de 60s
        </button>
      </div>
    </form>
  );
}

export default HeroInput;
