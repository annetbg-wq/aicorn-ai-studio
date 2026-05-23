import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomTabs } from '@/components/BottomTabs';
import { AppProvider, useApp } from '@/context/AppContext';
import HomePage from '@/pages/Home';
import BrowsePage from '@/pages/Browse';
import ListingPage from '@/pages/Listing';
import SellerDashboardPage from '@/pages/SellerDashboard';
import MessagesPage from '@/pages/Messages';
import ProfilePage from '@/pages/Profile';
const pages: Record<string, () => JSX.Element> = {
  Home: HomePage,
  Browse: BrowsePage,
  Listing: ListingPage,
  SellerDashboard: SellerDashboardPage,
  Messages: MessagesPage,
  Profile: ProfilePage
};
export default function App() {
  return <ErrorBoundary><AppProvider><MobileApp /></AppProvider></ErrorBoundary>;
}
function MobileApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="mobile-shell"><Page /><BottomTabs activeRoute={activeRoute} onChange={setActiveRoute}/></div>; }
