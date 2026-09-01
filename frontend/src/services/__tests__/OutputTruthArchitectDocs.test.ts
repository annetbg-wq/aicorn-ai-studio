import { describe, expect, it } from 'vitest';

import { analyzeOutputTruth } from '../../shared/outputTruth';

describe('output truth product-copy scan scope', () => {
  it('ignores internal architect documents while still blocking placeholder copy on product screens', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/docs/architect/product-plan.json': JSON.stringify({
          note: 'Placeholder examples are allowed inside internal architecture evidence.',
        }),
        'src/docs/architect/feature-checklist.md': 'TODO: explain the implementation evidence.',
        'src/pages/Home.tsx': `
          export default function Home() {
            return <main><h1>Coming soon</h1><button onClick={() => undefined}>Open</button></main>;
          }
        `,
      },
      changedPaths: [
        'src/docs/architect/product-plan.json',
        'src/docs/architect/feature-checklist.md',
        'src/pages/Home.tsx',
      ],
      routeCount: 1,
    });

    const placeholderPaths = truth.placeholderHits.map((hit) => hit.path);
    expect(placeholderPaths.some((path) => path === 'src/pages/Home.tsx')).toBe(true);
    expect(placeholderPaths.some((path) => path.startsWith('src/docs/architect/'))).toBe(false);
    expect(truth.blockers.map((blocker) => blocker.code)).toContain('placeholder-text');
  });

  it('does not create placeholder blockers when only internal architect docs contain placeholder language', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/docs/architect/product-specificity.json': JSON.stringify({
          guidance: 'Placeholder and TODO language here describes internal planning rules.',
        }),
        'src/pages/Home.tsx': `
          export default function Home() {
            const [count, setCount] = [1, () => undefined];
            return <main><section><h1>Life hub</h1><p>Money, wellness and learning today.</p><button onClick={() => setCount()}>Open Money</button></section></main>;
          }
        `,
      },
      changedPaths: [
        'src/docs/architect/product-specificity.json',
        'src/pages/Home.tsx',
      ],
      routeCount: 1,
    });

    expect(truth.placeholderHits).toHaveLength(0);
    expect(truth.blockers.map((blocker) => blocker.code)).not.toContain('placeholder-text');
  });
});
