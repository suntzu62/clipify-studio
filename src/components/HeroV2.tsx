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
import { useAuth } from '@/contexts/AuthContext';
import { createTempConfig } from '@/lib/jobs-api';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { isValidYouTubeUrl, normalizeYoutubeUrl } from '@/lib/youtube';

const HERO_VARIANT = (import.meta.env.VITE_HERO_VARIANT as 'A' | 'B' | undefined) || 'A';

const HEADLINE_A = 'Gere 8–12 Shorts a partir de um vídeo longo';
const HEADLINE_B = 'Transforme vídeos longos em Shorts prontos';
const SUBHEAD = 'Cole o link do YouTube (≥10 min). Primeiro clipe em poucos minutos.';

const DEMO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';


export default function HeroV2() {
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const { user, getToken } = useAuth();

  useEffect(() => {
    try { posthog.capture('hero variant', { v: HERO_VARIANT }); } catch {}
  }, []);

  useEffect(() => {
    const pending = localStorage.getItem('cortai:pendingHeroUrl');
    if (user && pending) {
      localStorage.removeItem('cortai:pendingHeroUrl');
      void handleSubmitInternal(pending);
    }
  }, [user]);

  const showSuccess = () => {
    setSuccess(true);
    setTimeout(() => setSuccess(false), 800);
  };

  const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const normalized = normalizeYoutubeUrl(text.trim());
    if (isValidYouTubeUrl(normalized)) {
      setUrl(normalized);
      setError(null);
      showSuccess();
      requestAnimationFrame(() => submitBtnRef.current?.focus());
    }
  };

  const validate = (value: string) => {
    if (!isValidYouTubeUrl(value)) {
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

    if (!user) {
      localStorage.setItem('cortai:pendingHeroUrl', value);
      navigate('/auth/login');
      return;
    }

    try {
      setLoading(true);
      const tokenProvider = async () => await getToken();
      const { tempId } = await createTempConfig(normalizeYoutubeUrl(value), tokenProvider);

      // Navigate to configuration page instead of direct processing
      navigate(`/projects/configure/${tempId}`);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      
      // Detectar erro de YouTube não conectado
      if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('youtube')) {
        toast({ 
          title: '🔐 Reconecte sua conta do YouTube', 
          description: 'Faça logout e login novamente para autorizar o YouTube com os novos scopes.',
          variant: 'default'
        });
        // signOut já está disponível do useAuth na linha 36
        navigate('/auth/login');
      } else {
        toast({ 
          title: 'Falha ao criar pipeline', 
          description: errorMsg, 
          variant: 'destructive' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative">
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-6 py-16 md:py-24">
        <Card className="bg-white/10 backdrop-blur-xl border-white/20 rounded-3xl shadow-xl animate-in fade-in-50 slide-in-from-bottom-2">
          <CardContent className="p-6 md:p-8">
            <h1 className="text-3xl md:text-5xl font-semibold text-white leading-tight tracking-tight [text-wrap:balance]">
              {HERO_VARIANT === 'A' ? HEADLINE_A : HEADLINE_B}
            </h1>
            <p className="mt-2 text-white/80">{SUBHEAD}</p>

            {/* Benefits row */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/90">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-300" />
                Legendas queimadas auto
              </span>
              <span className="text-white/60">•</span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-300" />
                Cortes de 30–90s prontos
              </span>
              <span className="text-white/60">•</span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-300" />
                Upload direto como Shorts
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 grid gap-3" aria-describedby="tips">
              <Label htmlFor="yt" className="text-white/90 font-medium">Cole o link do YouTube</Label>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500 h-5 w-5" />
                  <Input
                    id="yt"
                    type="url"
                    placeholder="https://youtube.com/watch?v=exemplo (≥10min)"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onPaste={handlePaste}
                    onBlur={handleBlur}
                    aria-invalid={!!error}
                    aria-describedby="tips"
                    className={`pl-12 h-14 text-lg bg-white/95 text-gray-900 placeholder:text-gray-500 border-0 focus:ring-2 focus:ring-white/50 placeholder-caret-blink transition-all duration-200 ${success ? 'ring-2 ring-green-400' : ''}`}
                  />
                </div>
                <Button 
                  ref={submitBtnRef} 
                  type="submit" 
                  className="h-14 px-8 text-base font-semibold bg-white text-primary hover:bg-white/90 hover:scale-105 transition-all duration-200 shadow-lg" 
                  aria-label="Gerar clipes agora" 
                  disabled={loading}
                >
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
