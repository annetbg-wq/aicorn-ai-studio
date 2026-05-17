export type Course = { id: string; title: string; category: string; lessons: number; progress: number; enrolled: boolean; instructor: string; };
export type Lesson = { id: string; courseId: string; title: string; completed: boolean; duration: string; };
export type QuizQuestion = { id: string; prompt: string; options: string[]; correctIndex: number; };
