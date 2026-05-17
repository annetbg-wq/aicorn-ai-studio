import { useTheme } from '@/hooks/useTheme';
export default function Settings(){ const { theme, toggleTheme } = useTheme(); return <main className="page"><h1 className="title">Workspace settings</h1><section className="card pad row"><span>Theme: {theme}</span><button className="btn secondary" onClick={toggleTheme}>Toggle theme</button></section></main> }
