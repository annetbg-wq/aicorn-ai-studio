import { CourseCard } from '@/components/CourseCard';
import { useApp } from '@/context/AppContext';
export default function CourseCatalog(){ const app = useApp(); return <main className="page"><h1 className="title">Course catalog</h1><div className="grid two">{app.courses.map(course=><CourseCard key={course.id} course={course} onOpen={(id)=>{app.setSelectedCourseId(id); app.setActiveRoute('CourseDetail')}} onEnroll={app.enroll}/>)}</div></main> }
