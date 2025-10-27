import { useEffect, useRef, useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Play, Youtube, AlertCircle } from 'lucide-react';
import posthog from 'posthog-js';
import { useAuth } from '@/contexts/AuthContext';
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
  const [errorType, setErrorType] = useState<'quota' | 'private' | 'blocked' | 'age' | 'unknown' | null>(null);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const { user, getToken } = useAuth();

  useEffect(() => {
    // Retry after login
    const pending = localStorage.getItem('cortai:pendingHeroUrl');
    if (user && pending) {
      localStorage.removeItem('cortai:pendingHeroUrl');
      void handleSubmitInternal(pending);
    }
  }, [user]);

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

    if (!user) {
      localStorage.setItem('cortai:pendingHeroUrl', value);
      navigate('/auth/login');
      return;
    }

    try {
      setLoading(true);
      const tokenProvider = async () => await getToken();
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
      
      // Enhanced error handling with specific error type detection
      const errorMessage = e?.message || String(e);
      const errorLower = errorMessage.toLowerCase();
      
      // Detect error type
      let detectedErrorType: typeof errorType = 'unknown';
      if (errorLower.includes('quota') || errorLower.includes('rate limit')) {
        detectedErrorType = 'quota';
      } else if (errorLower.includes('private')) {
        detectedErrorType = 'private';
      } else if (errorLower.includes('blocked') || errorLower.includes('region')) {
        detectedErrorType = 'blocked';
      } else if (errorLower.includes('age') || errorLower.includes('restricted')) {
        detectedErrorType = 'age';
      }
      
      setErrorType(detectedErrorType);
      
      const isYouTubeError = ['quota', 'private', 'blocked', 'age'].includes(detectedErrorType);
      
      if (isYouTubeError && retryCount < 2) {
        setRetryCount(prev => prev + 1);
        setError('YouTube temporariamente indisponível. Tentando novamente...');
        
        // Retry after a short delay
        setTimeout(() => {
          handleSubmitInternal(value);
        }, 2000);
        return;
      }
      
      // Show fallback option immediately for YouTube errors
      if (isYouTubeError) {
        setShowFallback(true);
        
        // Custom error messages based on type
        const errorMessages: Record<typeof detectedErrorType, { title: string; description: string }> = {
          quota: {
            title: 'Limite do YouTube atingido 📺',
            description: 'Use upload direto como alternativa rápida'
          },
          private: {
            title: 'Vídeo privado 🔒',
            description: 'Faça upload do arquivo ou configure cookies.txt'
          },
          blocked: {
            title: 'Vídeo bloqueado na sua região 🌍',
            description: 'Tente upload direto do arquivo'
          },
          age: {
            title: 'Conteúdo com restrição de idade 🔞',
            description: 'Faça upload do arquivo como alternativa'
          },
          unknown: {
            title: 'YouTube indisponível 📺',
            description: 'Tente fazer upload do arquivo local'
          }
        };
        
        const msg = errorMessages[detectedErrorType];
        setError(msg.title);
        toast({
          title: msg.title,
          description: msg.description,
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

      {/* Fallback upload option with contextual messaging */}
      {showFallback && (
        <div className="mt-6 space-y-3">
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">ou</p>
          </div>
          <FileUploadZone onUploadSuccess={(jobId) => navigate(`/projects/${jobId}`)} />
          <p className="text-xs text-center text-muted-foreground">
            {errorType === 'private' && '🔒 Para vídeos privados, faça upload do arquivo diretamente'}
            {errorType === 'quota' && '⚡ Upload direto ignora limites do YouTube'}
            {errorType === 'blocked' && '🌍 Upload direto funciona para qualquer região'}
            {errorType === 'age' && '✨ Upload direto não tem restrições'}
            {(!errorType || errorType === 'unknown') && '📤 Faça upload do seu arquivo local como alternativa'}
          </p>
        </div>
      )}
    </div>
  );
}

export default HeroInput;
