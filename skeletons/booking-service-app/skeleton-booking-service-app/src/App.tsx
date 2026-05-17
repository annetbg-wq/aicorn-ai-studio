import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomTabs } from '@/components/BottomTabs';
import { AppProvider, useApp } from '@/context/AppContext';
import HomePage from '@/pages/Home';
import SearchPage from '@/pages/Search';
import ServiceDetailPage from '@/pages/ServiceDetail';
import BookingFlowPage from '@/pages/BookingFlow';
import MyBookingsPage from '@/pages/MyBookings';
import ProfilePage from '@/pages/Profile';
const pages: Record<string, () => JSX.Element> = {
  Home: HomePage,
  Search: SearchPage,
  ServiceDetail: ServiceDetailPage,
  BookingFlow: BookingFlowPage,
  MyBookings: MyBookingsPage,
  Profile: ProfilePage
};
export default function App() {
  return <ErrorBoundary><AppProvider><MobileApp /></AppProvider></ErrorBoundary>;
}
function MobileApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="mobile-shell"><Page /><BottomTabs activeRoute={activeRoute} onChange={setActiveRoute}/></div>; }
