import { useTheme } from '@/hooks/useTheme';
export default function Settings(){ const { toggleTheme } = useTheme(); return <main className="page"><h1 className="title">Preferences</h1><button className="btn secondary" onClick={toggleTheme}>Toggle theme</button></main> }
