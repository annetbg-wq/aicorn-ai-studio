import { createContext, useContext, useMemo, useState } from 'react';
import { courses as seedCourses, lessons as seedLessons, quiz as seedQuiz } from '@/data/seed';
import type { Course, Lesson, QuizQuestion } from '@/data/types';
type AppContextValue = { activeRoute: string; setActiveRoute: (route: string) => void; courses: Course[]; lessons: Lesson[]; quiz: QuizQuestion[]; selectedCourseId: string; setSelectedCourseId: (id: string) => void; enroll: (id: string) => void; completeLesson: (id: string) => void; submitQuiz: (index: number) => void; streak: number; certificates: number; learningProgress: number; };
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
 const [activeRoute, setActiveRoute] = useState('Home'); const [courses, setCourses] = useState(seedCourses); const [lessons, setLessons] = useState(seedLessons); const [selectedCourseId, setSelectedCourseId] = useState(seedCourses[0]?.id ?? ''); const [streak, setStreak] = useState(6); const [certificates, setCertificates] = useState(1);
 const learningProgress = useMemo(() => Math.round(courses.reduce((sum, course) => sum + course.progress, 0) / courses.length), [courses]);
 const enroll = (id: string) => setCourses((current) => current.map((course) => course.id === id ? { ...course, enrolled:true, progress: Math.max(course.progress, 5) } : course));
 const completeLesson = (id: string) => { const lesson = lessons.find((item) => item.id === id); setLessons((current) => current.map((item) => item.id === id ? { ...item, completed:true } : item)); if (lesson) setCourses((current) => current.map((course) => course.id === lesson.courseId ? { ...course, progress: Math.min(100, course.progress + 12) } : course)); setStreak((current) => current + 1); };
 const submitQuiz = (index: number) => { if (index === seedQuiz[0].correctIndex) setCertificates((current) => current + 1); };
 const value = { activeRoute, setActiveRoute, courses, lessons, quiz: seedQuiz, selectedCourseId, setSelectedCourseId, enroll, completeLesson, submitQuiz, streak, certificates, learningProgress };
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used inside AppProvider'); return ctx; }
