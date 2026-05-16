// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canUseDevAuthBypass,
  isCreatorMode,
  isFounderAdminEmail,
} from '../internalAccess';

describe('internalAccess', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('normalizes founder admin emails from env', () => {
    vi.stubEnv('VITE_FOUNDER_ADMIN_EMAILS', ' founder@aic.dev, second@example.com ');

    expect(isFounderAdminEmail('FOUNDER@aic.dev')).toBe(true);
    expect(isFounderAdminEmail('second@example.com')).toBe(true);
  });

  it('does not grant admin bypass on non-localhost hosts', () => {
    expect(canUseDevAuthBypass('staging.aic.dev', '1')).toBe(false);
    expect(isCreatorMode()).toBe(false);
  });

  it('keeps localhost bypass available for local testing', () => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');

    expect(canUseDevAuthBypass('localhost', '1')).toBe(true);
    expect(isCreatorMode()).toBe(true);
  });

  it('does not treat unknown emails as founder admins', () => {
    vi.stubEnv('VITE_FOUNDER_ADMIN_EMAILS', 'founder@aic.dev');

    expect(isFounderAdminEmail('guest@example.com')).toBe(false);
  });
});
