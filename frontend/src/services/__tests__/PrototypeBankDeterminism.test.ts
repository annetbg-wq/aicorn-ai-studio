import { describe, expect, it } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import { PrototypeBankService } from '../PrototypeBankService';

describe('Prototype bank deterministic test boundary', () => {
  it('resolves built-in archetype and domain without a network wait', async () => {
    PrototypeBankService.invalidateCache();
    const startedAt = performance.now();

    const context = await resolveDesignContext(
      'wellness mobile fitness tracker with habits and progress',
      'mobile-app',
    );

    expect(context.archetype?.id).toBe('consumer-feed');
    expect(context.domain?.id).toBe('wellness');
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});
