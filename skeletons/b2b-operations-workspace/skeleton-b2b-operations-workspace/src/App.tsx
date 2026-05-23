import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sidebar } from '@/components/Sidebar';
import { AppProvider, useApp } from '@/context/AppContext';
import DashboardPage from '@/pages/Dashboard';
import RecordsPage from '@/pages/Records';
import RecordDetailPage from '@/pages/RecordDetail';
import WorkflowPage from '@/pages/Workflow';
import TeamPage from '@/pages/Team';
import ReportsPage from '@/pages/Reports';
import SettingsPage from '@/pages/Settings';
const pages: Record<string, () => JSX.Element> = {
  Dashboard: DashboardPage,
  Records: RecordsPage,
  RecordDetail: RecordDetailPage,
  Workflow: WorkflowPage,
  Team: TeamPage,
  Reports: ReportsPage,
  Settings: SettingsPage
};
export default function App() {
  return <ErrorBoundary><AppProvider><DashboardApp /></AppProvider></ErrorBoundary>;
}
function DashboardApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="dashboard-shell"><Sidebar activeRoute={activeRoute} onChange={setActiveRoute}/><Page /></div>; }
