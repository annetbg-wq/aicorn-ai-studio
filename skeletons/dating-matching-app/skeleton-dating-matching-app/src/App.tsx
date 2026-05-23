import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomTabs } from '@/components/BottomTabs';
import { AppProvider, useApp } from '@/context/AppContext';
import OnboardingPage from '@/pages/Onboarding';
import DiscoverPage from '@/pages/Discover';
import MatchesPage from '@/pages/Matches';
import ConversationPage from '@/pages/Conversation';
import ProfilePage from '@/pages/Profile';
import SettingsPage from '@/pages/Settings';
const pages: Record<string, () => JSX.Element> = {
  Onboarding: OnboardingPage,
  Discover: DiscoverPage,
  Matches: MatchesPage,
  Conversation: ConversationPage,
  Profile: ProfilePage,
  Settings: SettingsPage
};
export default function App() {
  return <ErrorBoundary><AppProvider><MobileApp /></AppProvider></ErrorBoundary>;
}
function MobileApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="mobile-shell"><Page /><BottomTabs activeRoute={activeRoute} onChange={setActiveRoute}/></div>; }
