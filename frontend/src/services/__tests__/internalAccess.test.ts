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

  // --- hardcoded founder admin emails ---

  it('recognizes annetdenr@gmail.com as founder admin', () => {
    expect(isFounderAdminEmail('annetdenr@gmail.com')).toBe(true);
  });

  it('recognizes vkdevproai@gmail.com as founder admin', () => {
    expect(isFounderAdminEmail('vkdevproai@gmail.com')).toBe(true);
  });

  it('matches founder admin emails case-insensitively and trims spaces', () => {
    expect(isFounderAdminEmail('  ANNETDENR@GMAIL.COM  ')).toBe(true);
    expect(isFounderAdminEmail('VKDEVPROAI@GMAIL.COM')).toBe(true);
  });

  it('does not treat unknown emails as founder admins', () => {
    expect(isFounderAdminEmail('guest@example.com')).toBe(false);
    expect(isFounderAdminEmail('random@aic.dev')).toBe(false);
  });

  it('returns false for empty or null email', () => {
    expect(isFounderAdminEmail(null)).toBe(false);
    expect(isFounderAdminEmail(undefined)).toBe(false);
    expect(isFounderAdminEmail('')).toBe(false);
    expect(isFounderAdminEmail('   ')).toBe(false);
  });

  // --- env override/addition ---

  it('also recognizes emails added via VITE_FOUNDER_ADMIN_EMAILS env', () => {
    vi.stubEnv('VITE_FOUNDER_ADMIN_EMAILS', ' founder@aic.dev, second@example.com ');

    expect(isFounderAdminEmail('FOUNDER@aic.dev')).toBe(true);
    expect(isFounderAdminEmail('second@example.com')).toBe(true);
    // hardcoded defaults still work alongside env additions
    expect(isFounderAdminEmail('annetdenr@gmail.com')).toBe(true);
  });

  // --- dev bypass (AIC_DEV_AUTH_BYPASS) does not grant admin ---

  it('does not grant admin bypass on non-localhost hosts', () => {
    expect(canUseDevAuthBypass('staging.aic.dev', '1')).toBe(false);
    expect(isCreatorMode()).toBe(false);
  });

  it('keeps localhost bypass available for local testing', () => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');

    expect(canUseDevAuthBypass('localhost', '1')).toBe(true);
    expect(isCreatorMode()).toBe(true);
  });

  it('AIC_DEV_AUTH_BYPASS on non-localhost does not make an unknown email a founder admin', () => {
    // bypass is a separate concern — it must never elevate email-based admin check
    expect(isFounderAdminEmail('someuser@staging.aic.dev')).toBe(false);
  });
});
