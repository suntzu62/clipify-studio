import { useState } from "react";
import Header from "@/components/Header";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";
import HeroV2 from "@/components/HeroV2";
import { DualInputHero } from "@/components/DualInputHero";
import DemoModal from "@/components/DemoModal";
import { useSearchParams } from 'react-router-dom';

export default function Landing() {
  const [showDemo, setShowDemo] = useState(false);
  const [searchParams] = useSearchParams();

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        {/* Enhanced Hero with Dual Input */}
        <section className="container mx-auto px-6 pt-16 pb-24">
          <div className="text-center space-y-12">
            <div className="space-y-6">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                Transforme <span className="text-primary">longos vídeos</span><br />
                em clipes <span className="bg-gradient-primary bg-clip-text text-transparent">virais</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Inteligência artificial que identifica os melhores momentos e cria clipes perfeitos para TikTok, Instagram e YouTube Shorts
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto">
              <DualInputHero
                onOpenDemo={() => setShowDemo(true)}
                prefillUrl={searchParams.get('url')}
              />
            </div>
          </div>
        </section>

        {/* Keep existing sections below hero */}
        <Features />
        <HowItWorks />
        <Pricing />
      </main>
      <Footer />
      
      {/* Demo Modal */}
      <DemoModal 
        open={showDemo}
        onOpenChange={setShowDemo}
        onUseDemo={() => {
          setShowDemo(false);
          // Could add demo URL to input here
        }}
      />
    </div>
  );
}
