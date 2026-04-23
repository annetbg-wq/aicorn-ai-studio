import { Button } from "@/components/ui/button";
import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ display: "grid", gap: 12, textAlign: "center" }}>
        <h1 data-testid="project-title" style={{ margin: 0 }}>Pulse Deck Arena</h1>
        <p data-testid="count-value" style={{ margin: 0, fontSize: 32 }}>{count}</p>
        <Button type="button" onClick={() => setCount(value => value + 1)} style={{ padding: "12px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "#22c55e", color: "#052e16", fontWeight: 700 }}>
          Increment
        </Button>
      </section>
    </main>
  );
}
