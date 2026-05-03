import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Nav } from '@/components/Nav';
import { Hero } from '@/components/sections/Hero';
import { SocialProof } from '@/components/sections/SocialProof';
import { Features } from '@/components/sections/Features';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { Pricing } from '@/components/sections/Pricing';
import { FAQ } from '@/components/sections/FAQ';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { Footer } from '@/components/sections/Footer';

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <div className="min-h-screen scroll-smooth bg-background text-foreground">
        <Nav />
        <main>
          <Hero />
          <SocialProof />
          <Features />
          <HowItWorks />
          <Pricing />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
