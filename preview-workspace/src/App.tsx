import { Button } from "@/components/ui/button";
import { useState } from 'react';
export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e2e8f0' }}>
      <div data-testid='live-canary-surface'>
        <strong data-testid='count-value'>{count}</strong>
        <Button type='button' onClick={() => setCount(v => v + 1)}>Increment</Button>
      </div>
    </main>
  );
}