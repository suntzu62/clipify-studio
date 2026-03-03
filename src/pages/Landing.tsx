import { useState } from "react";
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useScroll, useSpring } from 'framer-motion';
import Header from "@/components/Header";
import LazyFeatures from "@/components/LazyFeatures";
import LazyHowItWorks from "@/components/LazyHowItWorks";
import LazyPricing from "@/components/LazyPricing";
import LazyFooter from "@/components/LazyFooter";
import { DualInputHero } from "@/components/DualInputHero";
import DemoModal from "@/components/DemoModal";
import { FAQ, CTA, FloatingOrbs, AnimatedText } from "@/components/landing";

export default function Landing() {
  const [showDemo, setShowDemo] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  const handleGetStarted = () => {
    navigate('/auth/register');
  };

  return (
    <div className="min-h-screen">
      <Header />

      {/* Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-primary origin-left z-[51]"
        style={{ scaleX }}
      />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-24">
          {/* Background layers */}
          <FloatingOrbs />
          <div className="absolute inset-0 grid-pattern animate-grid-move opacity-20 pointer-events-none" />
          <div className="absolute inset-0 spotlight pointer-events-none" />

          <div className="container mx-auto px-6 relative z-10">
            <div className="text-center space-y-12">
              {/* Hero Content */}
              <div className="space-y-6">
                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20 mb-4 animate-float"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span className="text-sm font-medium text-primary">
                    Usado por +10.000 criadores
                  </span>
                </motion.div>

                {/* Heading */}
                <AnimatedText
                  text="Transforme longos vídeos em clipes virais"
                  as="h1"
                  className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight"
                  staggerDelay={0.07}
                  delay={0.3}
                  highlightWords={{
                    'longos': 'text-primary',
                    'vídeos': 'text-primary',
                    'virais': 'gradient-text-premium animate-gradient-text',
                  }}
                />

                {/* Subtitle */}
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
                >
                  Inteligência artificial que identifica os melhores momentos e cria clipes perfeitos para TikTok, Instagram e YouTube Shorts
                </motion.p>
              </div>

              {/* Hero Input — 3D Entrance */}
              <motion.div
                initial={{ opacity: 0, y: 40, rotateX: 10 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ delay: 1.0, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                style={{ perspective: 1000 }}
                className="max-w-4xl mx-auto"
              >
                <DualInputHero
                  onOpenDemo={() => setShowDemo(true)}
                  prefillUrl={searchParams.get('url')}
                />
              </motion.div>

              {/* Trust Indicators — Staggered */}
              <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm text-muted-foreground pt-4">
                {[
                  'Sem cartão necessário',
                  'Cancele quando quiser',
                  'Suporte em português',
                ].map((text, i) => (
                  <motion.div
                    key={text}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.3 + i * 0.15, duration: 0.4 }}
                    className="flex items-center gap-2"
                  >
                    <motion.svg
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 1.3 + i * 0.15, type: 'spring', stiffness: 400 }}
                      className="w-5 h-5 text-success"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </motion.svg>
                    <span>{text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <LazyFeatures />
        </motion.div>

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <LazyHowItWorks />
        </motion.div>

        {/* Pricing */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <LazyPricing />
        </motion.div>

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
