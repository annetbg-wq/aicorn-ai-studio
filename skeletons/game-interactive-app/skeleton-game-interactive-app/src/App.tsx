import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomTabs } from '@/components/BottomTabs';
import { AppProvider, useApp } from '@/context/AppContext';
import HomePage from '@/pages/Home';
import LevelSelectPage from '@/pages/LevelSelect';
import GameScreenPage from '@/pages/GameScreen';
import LeaderboardPage from '@/pages/Leaderboard';
import AchievementsPage from '@/pages/Achievements';
import ProfilePage from '@/pages/Profile';
const pages: Record<string, () => JSX.Element> = {
  Home: HomePage,
  LevelSelect: LevelSelectPage,
  GameScreen: GameScreenPage,
  Leaderboard: LeaderboardPage,
  Achievements: AchievementsPage,
  Profile: ProfilePage
};
export default function App() {
  return <ErrorBoundary><AppProvider><MobileApp /></AppProvider></ErrorBoundary>;
}
function MobileApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="mobile-shell"><Page /><BottomTabs activeRoute={activeRoute} onChange={setActiveRoute}/></div>; }
