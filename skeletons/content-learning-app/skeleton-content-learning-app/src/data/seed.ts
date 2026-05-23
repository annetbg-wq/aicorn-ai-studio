import type { Course, Lesson, QuizQuestion } from './types';
export const courses: Course[] = [
 { id:'crs-1', title:'AI product strategy', category:'Business', lessons:12, progress:42, enrolled:true, instructor:'Maya Chen' },
 { id:'crs-2', title:'Sleep science basics', category:'Health', lessons:9, progress:0, enrolled:false, instructor:'Dr. Nora Vale' },
 { id:'crs-3', title:'Design systems for founders', category:'Design', lessons:15, progress:16, enrolled:true, instructor:'Alex Kim' }
];
export const lessons: Lesson[] = [
 { id:'ls-1', courseId:'crs-1', title:'Define the wedge', completed:true, duration:'8 min' },
 { id:'ls-2', courseId:'crs-1', title:'Build the feedback loop', completed:false, duration:'12 min' },
 { id:'ls-3', courseId:'crs-3', title:'Tokens before screens', completed:false, duration:'10 min' }
];
export const quiz: QuizQuestion[] = [{ id:'q-1', prompt:'What makes a good prototype loop?', options:['Static mockups','Clickable feedback','Only screenshots'], correctIndex:1 }];
