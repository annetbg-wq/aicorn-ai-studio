import { Home, Moon, Brain, Heart, Sparkles, Leaf, Sun, Zap } from 'lucide-react';

export interface Meditation {
  id: string;
  title: string;
  description: string;
  duration: number; // minutes
  category: string;
  icon: string;
  stressTrigger?: string;
}

export const MEDITATIONS: Meditation[] = [
  {
    id: 'med-1',
    title: 'Quick Stress Relief',
    description: 'A rapid calming technique to release tension and find your center in just 5 minutes.',
    duration: 5,
    category: 'Stress Relief',
    icon: 'Zap',
    stressTrigger: 'Work pressure',
  },
  {
    id: 'med-2',
    title: 'Deep Sleep Journey',
    description: 'Drift into restful sleep with gentle body relaxation and soothing visualizations.',
    duration: 10,
    category: 'Sleep',
    icon: 'Moon',
    stressTrigger: 'Sleep issues',
  },
  {
    id: 'med-3',
    title: 'Focus Boost',
    description: 'Sharpen your concentration and clear mental fog with mindful breathing exercises.',
    duration: 7,
    category: 'Focus',
    icon: 'Brain',
    stressTrigger: 'Work pressure',
  },
  {
    id: 'med-4',
    title: 'Morning Calm',
    description: 'Start your day with intention and peace through gentle awakening meditation.',
    duration: 10,
    category: 'Stress Relief',
    icon: 'Sun',
    stressTrigger: 'General worry',
  },
  {
    id: 'med-5',
    title: 'Anxiety Soother',
    description: 'Grounding techniques and breathwork to ease anxious thoughts and find stability.',
    duration: 12,
    category: 'Stress Relief',
    icon: 'Heart',
    stressTrigger: 'Social anxiety',
  },
  {
    id: 'med-6',
    title: 'Body Scan Relaxation',
    description: 'Progressive muscle relaxation from head to toe, releasing stored tension.',
    duration: 15,
    category: 'Sleep',
    icon: 'Leaf',
    stressTrigger: 'General worry',
  },
  {
    id: 'med-7',
    title: 'Work Break Reset',
    description: 'A quick mental reset between meetings to restore energy and clarity.',
    duration: 5,
    category: 'Focus',
    icon: 'Sparkles',
    stressTrigger: 'Work pressure',
  },
  {
    id: 'med-8',
    title: 'Evening Wind Down',
    description: 'Transition from your busy day to a peaceful evening with gentle breathing.',
    duration: 10,
    category: 'Sleep',
    icon: 'Moon',
    stressTrigger: 'Sleep issues',
  },
];

export const CATEGORIES = ['All', 'Stress Relief', 'Sleep', 'Focus'];

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  Moon,
  Brain,
  Sun,
  Heart,
  Leaf,
  Sparkles,
  Home,
};