// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  ArchitectPlannerService,
  buildArchitectQuestions,
  type ArchitectKickoffPlan,
  type InferredCapability,
} from '../ArchitectPlannerService';

function makePlan(
  defaultOptionId: ArchitectKickoffPlan['defaultOptionId'],
  capabilities: InferredCapability[],
  questions: ArchitectKickoffPlan['questions'],
): ArchitectKickoffPlan {
  return {
    productType: 'app',
    branchBriefSummary: 'Prototype plan',
    capabilities,
    implementationSteps: [],
    questions,
    scopeOptions: [
      { id: 'core', label: 'Build core', description: 'Core only', capabilityIds: [] },
      { id: 'core_backend', label: 'Build core + backend', description: 'Core with backend', capabilityIds: ['backend', 'auth'] },
      { id: 'core_backend_ai', label: 'Build core + backend + AI', description: 'Core with backend and AI', capabilityIds: ['backend', 'auth', 'ai_chat'] },
      { id: 'revise', label: 'Revise plan', description: 'Revise before build', capabilityIds: [] },
    ],
    defaultOptionId,
  };
}

describe('ArchitectPlannerService architect clarification shaping', () => {
  it('build mode core produces a mock-data assumption', () => {
    const questions = buildArchitectQuestions({
      capabilities: [],
      productType: 'app',
      defaultScopeId: 'core',
      language: 'en',
    });

    expect(questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assumption',
          assumption: 'Using local/mock data only for the first pass.',
        }),
      ]),
    );
  });

  it('build mode core + backend produces a private-per-user assumption', () => {
    const questions = buildArchitectQuestions({
      capabilities: [{ id: 'backend', title: 'Backend', reason: 'Persist user data', scope: 'first_pass', priority: 'must' }],
      productType: 'app',
      defaultScopeId: 'core_backend',
      language: 'en',
    });

    expect(questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assumption',
          assumption: 'User data will be private per user for this first prototype.',
        }),
      ]),
    );
  });

  it('converts non-blocking public/private questions into assumptions', () => {
    const questions = buildArchitectQuestions({
      capabilities: [{ id: 'backend', title: 'Backend', reason: 'Persist user data', scope: 'first_pass', priority: 'must' }],
      productType: 'app',
      defaultScopeId: 'core_backend',
      language: 'en',
      candidateQuestions: ['Is user data shared (public board) or private per-user?'],
    });

    expect(questions.some(question => question.kind === 'blocking')).toBe(false);
    expect(questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assumption',
          assumption: 'User data will be private per user for this first prototype.',
        }),
      ]),
    );
  });

  it('does not render passive open questions in the architect summary when build will not wait', () => {
    const capabilities: InferredCapability[] = [
      { id: 'backend', title: 'Backend', reason: 'Persist user data', scope: 'first_pass', priority: 'must' },
    ];
    const questions = buildArchitectQuestions({
      capabilities,
      productType: 'app',
      defaultScopeId: 'core_backend',
      language: 'en',
      candidateQuestions: ['Is user data shared (public board) or private per-user?'],
    });

    const summary = ArchitectPlannerService.formatPlanForChat(
      makePlan('core_backend', capabilities, questions),
      'en',
    );

    expect(summary).toContain('**Assumptions:**');
    expect(summary).not.toContain('Open questions');
    expect(summary).not.toContain('Is user data shared (public board) or private per-user?');
  });

  it('returns structured blocking clarifications with concrete options', () => {
    const capabilities: InferredCapability[] = [
      { id: 'auth', title: 'Auth', reason: 'Accounts are required', scope: 'first_pass', priority: 'must' },
      { id: 'backend', title: 'Backend', reason: 'Persist workspace data', scope: 'first_pass', priority: 'must' },
    ];
    const questions = buildArchitectQuestions({
      capabilities,
      productType: 'saas',
      defaultScopeId: 'core_backend',
      language: 'en',
      candidateQuestions: ['Is this multi-tenant (org-scoped data) or single-user?'],
    });

    const blocking = questions.find(question => question.kind === 'blocking');

    expect(blocking).toBeTruthy();
    expect(blocking).toMatchObject({
      kind: 'blocking',
      defaultChoiceId: 'single_user',
      question: 'How should account data be scoped in the first pass?',
    });
    if (!blocking || blocking.kind !== 'blocking') throw new Error('Expected blocking question');
    expect(blocking.options).toHaveLength(3);
    expect(blocking.options.map(option => option.label)).toContain('Single user account');
  });
});
