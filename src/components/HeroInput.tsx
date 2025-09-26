import { useEffect, useRef, useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Play, Youtube, AlertCircle } from 'lucide-react';
import posthog from 'posthog-js';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import { enqueueFromUrl, type Job } from '@/lib/jobs-api';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { saveUserJob } from '@/lib/storage';
import { FileUploadZone } from '@/components/FileUploadZone';
import { getYouTubeMetadata, createProjectTitle } from '@/lib/youtube-metadata';
import { isValidYouTubeUrl, normalizeYoutubeUrl } from '@/lib/youtube';

export interface HeroInputProps {
  className?: string;
  onOpenDemo: () => void;
  prefillUrl?: string | null;
}

const DEMO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';


export function HeroInput({ className, onOpenDemo, prefillUrl }: HeroInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validFlash, setValidFlash] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
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
    if (prefillUrl && isValidYouTubeUrl(prefillUrl)) {
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
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const normalized = normalizeYoutubeUrl(text.trim());
    if (isValidYouTubeUrl(normalized)) {
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
    if (!isValidYouTubeUrl(value)) {
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

      // Get metadata for better project title
      const metadata = await getYouTubeMetadata(normalizeYoutubeUrl(value));
      const projectTitle = createProjectTitle(normalizeYoutubeUrl(value), metadata);

      // Save job with enhanced metadata
      if (user?.id) {
        const job: Job = {
          id: jobId,
          youtubeUrl: normalizeYoutubeUrl(value),
          status: 'queued',
          progress: 0,
          createdAt: new Date().toISOString(),
          neededMinutes: 10,
          // Store metadata for display purposes
          result: {
            metadata: {
              title: projectTitle,
              thumbnail: metadata.thumbnailUrl,
              channel: metadata.channelName
            }
          }
        };
        saveUserJob(user.id, job);
      }

      navigate(`/projects/${jobId}`);
      setRetryCount(0); // Reset retry count on success
    } catch (e: any) {
      console.error('Pipeline enqueue failed:', e);
      
      // Enhanced error handling with fallback suggestions
      const errorMessage = e?.message || String(e);
      const isYouTubeError = errorMessage.toLowerCase().includes('youtube') || 
                            errorMessage.toLowerCase().includes('quota') ||
                            errorMessage.toLowerCase().includes('blocked');
      
      if (isYouTubeError && retryCount < 2) {
        setRetryCount(prev => prev + 1);
        setError('YouTube temporariamente indisponível. Tentando novamente...');
        
        // Retry after a short delay
        setTimeout(() => {
          handleSubmitInternal(value);
        }, 2000);
        return;
      }
      
      // Show fallback option after failures
      if (isYouTubeError) {
        setShowFallback(true);
        setError('YouTube indisponível no momento');
        toast({
          title: 'YouTube indisponível 📺',
          description: 'Tente fazer upload do arquivo local como alternativa',
          variant: 'destructive'
        });
      } else {
        toast({ 
          title: 'Falha ao criar pipeline', 
          description: errorMessage, 
          variant: 'destructive' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} aria-describedby="yt-help">
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
        {error && retryCount === 0 && (
          <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}
        {success && <p className="mt-2 text-sm text-green-600" role="status">{success}</p>}

        <div className="mt-3 flex items-center gap-4 text-sm">
          <button type="button" onClick={() => { try { posthog.capture('hero demo_open'); } catch {} onOpenDemo(); }} className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
            Ver demo de 60s
          </button>
        </div>
      </form>

      {/* Fallback upload option */}
      {showFallback && (
        <div className="mt-6 space-y-3">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">ou</p>
          </div>
          <FileUploadZone onUploadSuccess={(jobId) => navigate(`/projects/${jobId}`)} />
          <p className="text-xs text-center text-muted-foreground">
            YouTube indisponível? Faça upload do seu arquivo local como alternativa
          </p>
        </div>
      )}
    </div>
  );
}

export default HeroInput;
