import { useState } from 'react';

export function CounterCard() {
  const [count, setCount] = useState(0);
  return (
    <section style={{ display: "grid", gap: 12, textAlign: "center" }}>
      <h1 style={{ margin: 0 }}>Counter</h1>
      <p data-testid="count-value" style={{ margin: 0, fontSize: 32 }}>{count}</p>
      <button
        data-testid="counter-trigger"
        onClick={() => setCount(value => value + 1)}
        style={{ padding: "12px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "#22c55e", color: "#052e16", fontWeight: 700 }}
      >
        Increase
      </button>
    </section>
  );
}
