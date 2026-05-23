import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomTabs } from '@/components/BottomTabs';
import { AppProvider, useApp } from '@/context/AppContext';
import LobbyPage from '@/pages/Lobby';
import GamesPage from '@/pages/Games';
import GameDetailPage from '@/pages/GameDetail';
import PromotionsPage from '@/pages/Promotions';
import LeaderboardPage from '@/pages/Leaderboard';
import AccountPage from '@/pages/Account';
import ResponsibleGamingPage from '@/pages/ResponsibleGaming';
const pages: Record<string, () => JSX.Element> = {
  Lobby: LobbyPage,
  Games: GamesPage,
  GameDetail: GameDetailPage,
  Promotions: PromotionsPage,
  Leaderboard: LeaderboardPage,
  Account: AccountPage,
  ResponsibleGaming: ResponsibleGamingPage
};
export default function App() {
  return <ErrorBoundary><AppProvider><MobileApp /></AppProvider></ErrorBoundary>;
}
function MobileApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="mobile-shell"><Page /><BottomTabs activeRoute={activeRoute} onChange={setActiveRoute}/></div>; }
