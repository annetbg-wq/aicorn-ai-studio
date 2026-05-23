import { describe, it, expect } from 'vitest';
import { autoSelectSurface, SURFACE_CHOICE_TIMEOUT_MS } from '../surfaceHeuristic';

describe('autoSelectSurface', () => {
  it('returns "app" for a simple counter app prompt', () => {
    expect(autoSelectSurface('single screen counter app with one increment button')).toBe('app');
  });

  it('returns "app" for SaaS/dashboard prompts', () => {
    expect(autoSelectSurface('SaaS CRM dashboard for sales teams')).toBe('app');
    expect(autoSelectSurface('AI-powered habit tracker')).toBe('app');
    expect(autoSelectSurface('marketplace for freelancers')).toBe('app');
    expect(autoSelectSurface('studio for content creators')).toBe('app');
  });

  it('returns "app" by default for empty or ambiguous prompts', () => {
    expect(autoSelectSurface('')).toBe('app');
    expect(autoSelectSurface('I want to build something cool')).toBe('app');
    expect(autoSelectSurface('todo app')).toBe('app');
  });

  it('returns "superapp" for explicit super-app wording', () => {
    expect(autoSelectSurface('Build a super app with finance, social, and shopping')).toBe('superapp');
    expect(autoSelectSurface('super-app for urban mobility')).toBe('superapp');
    expect(autoSelectSurface('superapp for Southeast Asia')).toBe('superapp');
  });

  it('returns "superapp" for ecosystem / OS prompts', () => {
    expect(autoSelectSurface('Create a digital ecosystem for the whole company')).toBe('superapp');
    expect(autoSelectSurface('An operating system for modern remote teams')).toBe('superapp');
    expect(autoSelectSurface('OS for distributed companies')).toBe('superapp');
  });

  it('returns "superapp" for all-in-one / all modules wording', () => {
    expect(autoSelectSurface('All-in-one platform for remote teams')).toBe('superapp');
    expect(autoSelectSurface('Everything in one app for families')).toBe('superapp');
    expect(autoSelectSurface('Build with all modules: HR, CRM, Finance, Legal')).toBe('superapp');
    expect(autoSelectSurface('every module in a single shell')).toBe('superapp');
  });

  it('returns "superapp" for multi-module / omni-platform keywords', () => {
    expect(autoSelectSurface('multi-module enterprise productivity platform')).toBe('superapp');
    expect(autoSelectSurface('omni-platform for healthcare providers')).toBe('superapp');
  });

  it('SURFACE_CHOICE_TIMEOUT_MS is 60 000 ms', () => {
    expect(SURFACE_CHOICE_TIMEOUT_MS).toBe(60_000);
  });
});
