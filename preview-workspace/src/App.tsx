import { HeroLamp } from '@/components/sections/HeroLamp';
import { Footer } from '@/components/sections/Footer';

export default function App() {
  return (
    <>
      <HeroLamp {...{"title":"Улучшите свой сон","subtitle":"Персонализированные рекомендации для лучшего восстановления","ctaText":"Начать","ctaHref":"#"}} />
      <Footer {...{"brand":"Сон и восстановление"}} />
    </>
  );
}
