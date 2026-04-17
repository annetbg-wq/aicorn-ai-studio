import { CounterCard } from './components/CounterCard';

export default function App() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <CounterCard />
    </main>
  );
}
