// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dashboard } from '../Dashboard';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ googleAccessToken: null }),
}));

vi.mock('../../services/internalAccess', () => ({
  isCreatorMode: () => false,
}));

vi.mock('../../services/ideaFeedService', () => ({
  ensureNicheIdeas: vi.fn(() => Promise.resolve([])),
  getIdeaFeedEventName: () => 'aic-ideas-updated',
  hasIdeaGenerationAccess: () => false,
  loadCachedNiches: () => [],
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('Dashboard project identity', () => {
  it('renders canonical project name instead of drifting to title or Untitled', () => {
    render(
      <Dashboard
        sessionCost={0}
        sessionTokens={0}
        cloudAvailable={false}
        projects={[
          {
            id: 'project-with-both',
            name: 'Canonical Project Name',
            title: 'Legacy Title Should Not Win',
            theme: 'dark-slate',
            updatedAt: '2026-04-21T08:00:00.000Z',
          },
          {
            id: 'legacy-title-only',
            title: 'Legacy Title Normalized',
            theme: 'dark-slate',
            updatedAt: '2026-04-20T08:00:00.000Z',
          },
        ]}
        onEnterEngine={vi.fn()}
        onLoadProject={vi.fn()}
        onStartBlueprint={vi.fn()}
      />,
    );

    expect(screen.getByText('Canonical Project Name')).toBeInTheDocument();
    expect(screen.getByText('Legacy Title Normalized')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Title Should Not Win')).not.toBeInTheDocument();
    expect(screen.queryByText('Untitled')).not.toBeInTheDocument();
  });
});
