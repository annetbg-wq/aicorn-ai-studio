import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sidebar } from '@/components/Sidebar';
import { AppProvider, useApp } from '@/context/AppContext';
import HomePage from '@/pages/Home';
import EditorPage from '@/pages/Editor';
import MediaPage from '@/pages/Media';
import PublicationsPage from '@/pages/Publications';
import AnalyticsPage from '@/pages/Analytics';
import SettingsPage from '@/pages/Settings';
const pages: Record<string, () => JSX.Element> = {
  Home: HomePage,
  Editor: EditorPage,
  Media: MediaPage,
  Publications: PublicationsPage,
  Analytics: AnalyticsPage,
  Settings: SettingsPage
};
export default function App() {
  return <ErrorBoundary><AppProvider><DashboardApp /></AppProvider></ErrorBoundary>;
}
function DashboardApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="dashboard-shell"><Sidebar activeRoute={activeRoute} onChange={setActiveRoute}/><Page /></div>; }
