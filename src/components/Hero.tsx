import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState, useEffect, useRef, FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { createTempConfig } from "@/lib/jobs-api";
import posthog from "posthog-js";
import { Loader2, Youtube, Cloud, Video, Upload } from "lucide-react";
import { FileUploadZone } from "@/components/FileUploadZone";

const DEMO_URL = "https://www.youtube.com/watch?v=Zi_XLOBDo_Y"; // Ajuste conforme necessário

function isValidYoutubeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
      // Accept watch?v= or youtu.be/ID or shorts/ID
      if (host === "youtu.be") return url.pathname.length > 1;
      if (url.pathname.startsWith("/watch")) return !!url.searchParams.get("v");
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2]?.length > 0;
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
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (host.endsWith("youtube.com") && url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

export default function Hero() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const pendingUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // If user just signed in and there is a pending URL, enqueue
    const pending = localStorage.getItem("cortai:pendingHeroUrl");
    if (user && pending) {
      localStorage.removeItem("cortai:pendingHeroUrl");
      pendingUrlRef.current = pending;
      void submitUrl(pending);
    }
  }, [user]);

  const submitUrl = async (raw: string) => {
    try {
      setLoading(true);
      const normalized = normalizeYoutubeUrl(raw.trim());
      const tokenProvider = async () => await getToken();
      const { tempId } = await createTempConfig(normalized, tokenProvider);
      if (!tempId) throw new Error("Resposta inválida do servidor");

      try { posthog.capture('temp config created', { source: 'landing' }); } catch {}

      // Navigate to configuration page instead of direct processing
      navigate(`/projects/configure/${tempId}`);
    } catch (e: any) {
      toast({ title: 'Falha ao criar configuração', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!isValidYoutubeUrl(value)) {
      setError('Insira um link válido do YouTube');
      try { posthog.capture('hero validation_error', { reason: 'invalid_url' }); } catch {}
      return;
    }

    setError(null);
    try { posthog.capture('hero submit', { hasUrl: true }); } catch {}

    if (!user) {
      // Ask user to sign in, then retry automatically
      localStorage.setItem("cortai:pendingHeroUrl", value);
      navigate('/auth/login');
      return;
    }

    await submitUrl(value);
  };

  const pickFile = () => {
    if (!user) {
      toast({ title: 'Login necessário', description: 'Faça login para enviar arquivos', variant: 'destructive' });
      navigate('/auth/login');
      return;
    }
    setShowUploadModal(true);
  };

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden bg-gradient-hero">
      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background/10 to-transparent" />

      <div className="container mx-auto max-w-3xl px-6 relative z-10">
        <Card className="rounded-2xl shadow-xl bg-background/70 backdrop-blur">
          <CardContent className="p-8 md:p-10">
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Crie Shorts a partir de qualquer vídeo
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Cole o link do YouTube (≥10 min) ou envie um arquivo.
                </p>
              </div>

              <form onSubmit={handleSubmit} aria-describedby="yt-help">
                <Label htmlFor="yt" className="mb-2 block">Cole o link do YouTube</Label>
                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    id="yt"
                    type="url"
                    placeholder="https://youtube.com/watch?v=…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="h-12 text-lg flex-1"
                    aria-invalid={!!error}
                    aria-describedby="yt-help"
                  />
                  <Button type="submit" className="h-12 px-6" disabled={loading} aria-label="Gerar clipes agora">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Gerar clipes agora
                  </Button>
                </div>
                <p id="yt-help" className="mt-1 text-xs text-muted-foreground">Exemplo: https://youtube.com/watch?v=…</p>
                {error && (
                  <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Button variant="ghost" type="button" onClick={pickFile} className="h-8 px-2" aria-label="Enviar arquivo local">
                    <Upload className="h-4 w-4 mr-1" /> Enviar arquivo
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => setUrl(DEMO_URL)} className="h-8 px-2" aria-label="Usar vídeo de demonstração">
                    Usar vídeo de demonstração
                  </Button>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="rounded-sm px-2 py-0 h-5 text-[11px]">
                      Suporta
                    </Badge>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1"><Youtube className="h-3 w-3" /> YouTube</span>
                      <span className="inline-flex items-center gap-1"><Cloud className="h-3 w-3" /> Google Drive</span>
                      <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> Vimeo</span>
                      <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> Zoom</span>
                      <span>…</span>
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">Sem cartão de crédito • Teste grátis</p>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar vídeo</DialogTitle>
            <DialogDescription>
              Arraste seu vídeo ou clique para selecionar. Formatos: MP4, MOV, AVI, MKV (máx. 5GB)
            </DialogDescription>
          </DialogHeader>
          <FileUploadZone
            onUploadSuccess={() => setShowUploadModal(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
