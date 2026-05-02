import type { TemplateName } from '../services/ArchitectPlannerService';

import HeroLampSource from './components/HeroLamp.tsx?raw';
import BentoGridSource from './components/BentoGrid.tsx?raw';
import MarqueeSource from './components/Marquee.tsx?raw';
import PricingSectionSource from './components/PricingSection.tsx?raw';
import CTASource from './components/CTA.tsx?raw';
import FAQSource from './components/FAQ.tsx?raw';
import LogosSource from './components/Logos.tsx?raw';
import FooterSource from './components/Footer.tsx?raw';

export const SECTION_SOURCE_MAP: Record<TemplateName, string> = {
  HeroLamp: HeroLampSource,
  BentoGrid: BentoGridSource,
  Marquee: MarqueeSource,
  PricingSection: PricingSectionSource,
  CTA: CTASource,
  FAQ: FAQSource,
  Logos: LogosSource,
  Footer: FooterSource,
};
