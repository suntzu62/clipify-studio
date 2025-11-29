import { useState } from "react";
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from "@/components/Header";
import LazyFeatures from "@/components/LazyFeatures";
import LazyHowItWorks from "@/components/LazyHowItWorks";
import LazyPricing from "@/components/LazyPricing";
import LazyFooter from "@/components/LazyFooter";
import { DualInputHero } from "@/components/DualInputHero";
import DemoModal from "@/components/DemoModal";
import { FAQ, CTA } from "@/components/landing";

export default function Landing() {
  const [showDemo, setShowDemo] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/auth/register');
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        {/* Hero Section */}
        <section className="container mx-auto px-6 pt-20 pb-24">
          <div className="text-center space-y-12">
            {/* Hero Content */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="text-sm font-medium text-primary">
                  Usado por +10.000 criadores
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                Transforme <span className="text-primary">longos vídeos</span><br />
                em clipes <span className="bg-gradient-primary bg-clip-text text-transparent">virais</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Inteligência artificial que identifica os melhores momentos e cria clipes perfeitos para TikTok, Instagram e YouTube Shorts
              </p>
            </div>

            {/* Hero Input */}
            <div className="max-w-4xl mx-auto">
              <DualInputHero
                onOpenDemo={() => setShowDemo(true)}
                prefillUrl={searchParams.get('url')}
              />
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm text-muted-foreground pt-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Sem cartão necessário</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Cancele quando quiser</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Suporte em português</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <LazyFeatures />

        {/* How It Works */}
        <LazyHowItWorks />

        {/* Pricing */}
        <LazyPricing />

        {/* FAQ */}
        <FAQ />

        {/* Final CTA */}
        <CTA onGetStarted={handleGetStarted} />
      </main>

      {/* Footer */}
      <LazyFooter />

      {/* Demo Modal */}
      <DemoModal
        open={showDemo}
        onOpenChange={setShowDemo}
        onUseDemo={() => {
          setShowDemo(false);
        }}
      />
    </div>
  );
}
