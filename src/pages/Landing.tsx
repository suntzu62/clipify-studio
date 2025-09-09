import Header from "@/components/Header";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";
import HeroV2 from "@/components/HeroV2";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroV2 />

        {/* Keep existing sections below hero */}
        <Features />
        <HowItWorks />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}
