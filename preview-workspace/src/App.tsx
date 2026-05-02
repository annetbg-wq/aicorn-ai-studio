import { HeroLamp } from '@/components/sections/HeroLamp';
import { Footer } from '@/components/sections/Footer';

export default function App() {
  return (
    <>
      <HeroLamp {...{"title":"Добро пожаловать в приложение событий!","subtitle":"Найдите события в вашем сообществе.","ctaText":"Начать","ctaHref":"#events"}} />
      <Footer {...{"brand":"Community Events"}} />
    </>
  );
}
