import { useEffect, useRef, useState, FormEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Youtube, Lock, Play, CheckCircle } from 'lucide-react';
import posthog from 'posthog-js';
import DemoModal from '@/components/DemoModal';
import SocialProofStrip from '@/components/SocialProofStrip';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import { enqueueFromUrl, type Job } from '@/lib/jobs-api';
import { saveUserJob } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const HERO_VARIANT = (import.meta.env.VITE_HERO_VARIANT as 'A' | 'B' | undefined) || 'A';

const HEADLINE_A = 'Gere 8–12 Shorts a partir de um vídeo longo';
const HEADLINE_B = 'Transforme vídeos longos em Shorts prontos';
const SUBHEAD = 'Cole o link do YouTube (≥10 min). Primeiro clipe em poucos minutos.';

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

export default function HeroV2() {
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const { isSignedIn, getToken } = useAuth();
  const { openSignIn } = useClerk();
  const { user } = useUser();

  useEffect(() => {
    try { posthog.capture('hero variant', { v: HERO_VARIANT }); } catch {}
  }, []);

  useEffect(() => {
    const pending = localStorage.getItem('cortai:pendingHeroUrl');
    if (isSignedIn && pending) {
      localStorage.removeItem('cortai:pendingHeroUrl');
      void handleSubmitInternal(pending);
    }
  }, [isSignedIn]);

  const showSuccess = () => {
    setSuccess(true);
    setTimeout(() => setSuccess(false), 800);
  };

  const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const normalized = normalizeYoutubeUrl(text.trim());
    if (isValidYoutubeUrl(normalized)) {
      setUrl(normalized);
      setError(null);
      showSuccess();
      requestAnimationFrame(() => submitBtnRef.current?.focus());
    }
  };

  const validate = (value: string) => {
    if (!isValidYoutubeUrl(value)) {
      return 'Esse link não parece do YouTube';
    }
    return null;
  };

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = () => {
    setTouched(true);
    const v = url.trim();
    const err = validate(v);
    setError(err);
    if (!err && v) showSuccess();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    await handleSubmitInternal(url);
  };

  const handleSubmitInternal = async (raw: string) => {
    const value = raw.trim();
    const err = validate(value);
    if (err) {
      setError(err);
      try { posthog.capture('hero validation_error', { reason: 'invalid_url' }); } catch {}
      return;
    }

    setError(null);
    try { posthog.capture('hero submit', { source: 'landing' }); } catch {}

    if (!isSignedIn) {
      localStorage.setItem('cortai:pendingHeroUrl', value);
      await openSignIn({
        afterSignInUrl: window.location.pathname,
        // @ts-ignore
        modal: true,
      });
      return;
    }

    try {
      setLoading(true);
      const tokenProvider = async () => await getToken({ template: 'supabase' });
      const { jobId } = await enqueueFromUrl(normalizeYoutubeUrl(value), tokenProvider);

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
    <section className="relative">
      <div className="absolute inset-0 bg-gradient-to-br from-[#6D28D9] via-[#7C3AED] to-[#9333EA]" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-6 py-16 md:py-24">
        <Card className="bg-white/10 backdrop-blur-xl border-white/20 rounded-3xl shadow-xl animate-in fade-in-50 slide-in-from-bottom-2">
          <CardContent className="p-6 md:p-8">
            <h1 className="text-3xl md:text-5xl font-semibold text-white leading-tight tracking-tight [text-wrap:balance]">
              {HERO_VARIANT === 'A' ? HEADLINE_A : HEADLINE_B}
            </h1>
            <p className="mt-2 text-white/80">{SUBHEAD}</p>

            {/* Benefits row */}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/80">
              <span>Legendas queimadas auto</span>
              <span>•</span>
              <span>Cortes de 30–90s prontos</span>
              <span>•</span>
              <span>Upload direto como Shorts</span>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-3" aria-describedby="tips">
              <Label htmlFor="yt" className="text-white/90">Cole o link do YouTube</Label>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70 text-white/80 h-5 w-5" />
                  <Input
                    id="yt"
                    type="url"
                    placeholder="https://youtube.com/watch?v=…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onPaste={handlePaste}
                    onBlur={handleBlur}
                    aria-invalid={!!error}
                    aria-describedby="tips"
                    className={`pl-10 h-14 text-lg bg-white text-foreground placeholder:text-muted-foreground placeholder-caret-blink ${success ? 'ring-2 ring-green-500' : ''}`}
                  />
                </div>
                <Button ref={submitBtnRef} type="submit" className="h-14 px-6 text-base" aria-label="Gerar clipes agora" disabled={loading}>
                  <Play className="mr-2 h-5 w-5" />
                  {loading ? 'Gerando…' : 'Gerar clipes agora'}
                </Button>
              </div>
              <p id="tips" className="text-xs text-white/80 flex items-center gap-2">
                <Lock className="h-4 w-4" /> Sem cartão • Privado e seguro • Cancele quando quiser
              </p>
              {touched && error && (
                <p className="text-sm text-rose-300" role="alert">{error}</p>
              )}
              {success && !error && (
                <p className="text-sm text-green-200 flex items-center gap-1" role="status">
                  <CheckCircle className="h-4 w-4" /> Link ok!
                </p>
              )}

              <div className="mt-1">
                <button type="button" onClick={() => { try { posthog.capture('hero demo_open'); } catch {} setDemoOpen(true); }} className="text-sm text-white/80 hover:text-white underline-offset-4 hover:underline">
                  Ver demo de 60s
                </button>
              </div>
            </form>

            <div className="mt-6">
              <SocialProofStrip />
            </div>
          </CardContent>
        </Card>
      </div>

      <DemoModal
        open={demoOpen}
        onOpenChange={setDemoOpen}
        onUseDemo={() => {
          setUrl(DEMO_URL);
          setTouched(true);
          setDemoOpen(false);
          showSuccess();
          requestAnimationFrame(() => submitBtnRef.current?.focus());
        }}
      />
    </section>
  );
}
