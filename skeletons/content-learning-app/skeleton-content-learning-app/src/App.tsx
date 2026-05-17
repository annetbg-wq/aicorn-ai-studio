import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomTabs } from '@/components/BottomTabs';
import { AppProvider, useApp } from '@/context/AppContext';
import HomePage from '@/pages/Home';
import CourseCatalogPage from '@/pages/CourseCatalog';
import CourseDetailPage from '@/pages/CourseDetail';
import LessonPlayerPage from '@/pages/LessonPlayer';
import QuizPage from '@/pages/Quiz';
import ProgressPage from '@/pages/Progress';
import ProfilePage from '@/pages/Profile';
const pages: Record<string, () => JSX.Element> = {
  Home: HomePage,
  CourseCatalog: CourseCatalogPage,
  CourseDetail: CourseDetailPage,
  LessonPlayer: LessonPlayerPage,
  Quiz: QuizPage,
  Progress: ProgressPage,
  Profile: ProfilePage
};
export default function App() {
  return <ErrorBoundary><AppProvider><MobileApp /></AppProvider></ErrorBoundary>;
}
function MobileApp() { const { activeRoute, setActiveRoute } = useApp(); const Page = pages[activeRoute] ?? pages[Object.keys(pages)[0]]; return <div className="mobile-shell"><Page /><BottomTabs activeRoute={activeRoute} onChange={setActiveRoute}/></div>; }
