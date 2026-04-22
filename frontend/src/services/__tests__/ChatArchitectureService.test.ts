import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('../PreviewController', () => ({
  previewLog: vi.fn(),
  setTimelineContext: vi.fn(),
}));

vi.mock('../RevisionManager', () => ({
  revisionManager: {
    materializePersistedFiles: vi.fn(),
  },
}));

vi.mock('../toastBus', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../lib/safeStorage', () => ({
  safeSetItem: vi.fn(),
}));

vi.mock('../projectCorruptionScan', () => ({
  scanBeforePreviewLoad: vi.fn(() => ({ safe: true, findings: [] })),
}));

import { ChatArchitectureService } from '../ChatArchitectureService';
import { ProjectRepository } from '../ProjectRepository';
import { createProjectBranchArchitecture } from '../../shared/projectModel';

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe('ChatArchitectureService', () => {
  const now = Date.parse('2026-04-18T12:00:00.000Z');

  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
  });

  it('extracts chat-derived architecture items with branch conversation linkage and preserves user language text', () => {
    const result = ChatArchitectureService.applyMessage({
      projectId: 'proj-chat-arch',
      branchId: 'feature-auth',
      branchName: 'feature-auth',
      language: 'ru',
      message: {
        id: 'msg-ru-1',
        role: 'user',
        type: 'text',
        timestamp: now,
        content: [
          '[decision] Используем Supabase Auth для авторизации и хранения сессий.',
          '[constraint] Нельзя добавлять отдельный бэкенд вне Supabase в первом проходе.',
          '[question] Нужна ли мультиарендность уже в первой версии?',
          '[deferred] Отложим enterprise SSO до следующего этапа.',
        ].join('\n'),
      },
    });

    expect(result.changed).toBe(true);
    expect(result.architecture.branch.chatThreadId).toBe('branch-chat:proj-chat-arch:feature-auth');
    expect(result.architecture.architectureDecisions).toHaveLength(1);
    expect(result.architecture.constraints).toHaveLength(1);
    expect(result.architecture.openQuestions).toHaveLength(1);
    expect(result.architecture.deferredItems).toHaveLength(1);

    expect(result.architecture.architectureDecisions[0]).toMatchObject({
      title: 'Используем Supabase Auth для авторизации и хранения сессий.',
      summary: 'Используем Supabase Auth для авторизации и хранения сессий.',
      status: 'proposed',
      source: 'branch_chat',
      chatLink: {
        messageId: 'msg-ru-1',
        chatThreadId: 'branch-chat:proj-chat-arch:feature-auth',
        conversationRef: 'branch-chat:proj-chat-arch:feature-auth',
        itemType: 'architecture_decision',
        extractedLanguage: 'ru',
      },
    });
    expect(result.architecture.constraints[0].summary).toContain('Нельзя добавлять отдельный бэкенд');
    expect(result.architecture.openQuestions[0].summary).toContain('Нужна ли мультиарендность');
    expect(result.architecture.deferredItems[0].summary).toContain('Отложим enterprise SSO');
  });

  it('supports the required chat-driven lifecycle transitions', () => {
    let architecture = ChatArchitectureService.applyMessage({
      projectId: 'proj-chat-status',
      branchId: 'feature-status',
      language: 'en',
      message: {
        id: 'msg-create-1',
        role: 'user',
        type: 'text',
        timestamp: now,
        content: [
          '[decision] Use Supabase auth for the first pass.',
          '[decision] Add enterprise SSO in the first pass.',
          '[question] Should tenant isolation be enforced now?',
        ].join('\n'),
      },
    }).architecture;

    architecture = ChatArchitectureService.applyMessage({
      projectId: 'proj-chat-status',
      branchId: 'feature-status',
      language: 'en',
      architecture,
      message: {
        id: 'msg-accept-1',
        role: 'assistant',
        type: 'text',
        timestamp: now + 1000,
        content: '[accept-decision] Use Supabase auth for the first pass.',
      },
    }).architecture;

    architecture = ChatArchitectureService.applyMessage({
      projectId: 'proj-chat-status',
      branchId: 'feature-status',
      language: 'en',
      architecture,
      message: {
        id: 'msg-accept-question',
        role: 'assistant',
        type: 'text',
        timestamp: now + 2000,
        content: '[accept-question] Should tenant isolation be enforced now?',
      },
    }).architecture;

    architecture = ChatArchitectureService.applyMessage({
      projectId: 'proj-chat-status',
      branchId: 'feature-status',
      language: 'en',
      architecture,
      message: {
        id: 'msg-defer-1',
        role: 'assistant',
        type: 'text',
        timestamp: now + 3000,
        content: '[defer-decision] Add enterprise SSO in the first pass.',
      },
    }).architecture;

    architecture = ChatArchitectureService.applyMessage({
      projectId: 'proj-chat-status',
      branchId: 'feature-status',
      language: 'en',
      architecture,
      message: {
        id: 'msg-supersede-1',
        role: 'assistant',
        type: 'text',
        timestamp: now + 4000,
        content: '[supersede-decision] Use Supabase auth for the first pass. => Use Clerk auth after the branch review.',
      },
    }).architecture;

    const acceptedReplacement = architecture.architectureDecisions.find(entry => entry.title === 'Use Clerk auth after the branch review.');
    const supersededOriginal = architecture.architectureDecisions.find(entry => entry.title === 'Use Supabase auth for the first pass.');
    const deferredDecision = architecture.architectureDecisions.find(entry => entry.title === 'Add enterprise SSO in the first pass.');
    const acceptedQuestion = architecture.openQuestions.find(entry => entry.title === 'Should tenant isolation be enforced now?');

    expect(supersededOriginal?.status).toBe('superseded');
    expect(acceptedReplacement?.status).toBe('accepted');
    expect(acceptedReplacement?.supersedesDecisionId).toBe(supersededOriginal?.id);
    expect(deferredDecision?.status).toBe('deferred');
    expect(architecture.deferredItems.some(entry => entry.relatedDecisionId === deferredDecision?.id)).toBe(true);
    expect(acceptedQuestion?.status).toBe('accepted');
  });

  it('persists chat-derived architecture items only on the active branch and keeps chat linkage metadata', async () => {
    await ProjectRepository.saveProject({
      id: 'proj-chat-store',
      name: 'Chat Store',
      description: 'Chat architecture persistence',
      theme: 'dark-slate',
      files: {},
      chatHistory: [],
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'feature-auth',
      branches: {
        main: {
          id: 'main',
          projectId: 'proj-chat-store',
          name: 'main',
          isDefault: false,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          files: {},
          chatHistory: [],
          revisions: [],
          architecture: createProjectBranchArchitecture('proj-chat-store', 'main', 'main', '2026-04-18T12:00:00.000Z'),
        },
        'feature-auth': {
          id: 'feature-auth',
          projectId: 'proj-chat-store',
          name: 'feature-auth',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          files: {},
          chatHistory: [],
          revisions: [],
          architecture: createProjectBranchArchitecture('proj-chat-store', 'feature-auth', 'feature-auth', '2026-04-18T12:00:00.000Z'),
        },
      },
    });

    const featureArchitecture = await ProjectRepository.getBranchArchitecture('proj-chat-store', 'feature-auth');
    const applied = ChatArchitectureService.applyMessage({
      projectId: 'proj-chat-store',
      branchId: 'feature-auth',
      branchName: 'feature-auth',
      language: 'en',
      architecture: featureArchitecture,
      message: {
        id: 'msg-persist-1',
        role: 'user',
        type: 'text',
        timestamp: now,
        content: '[decision] Use Supabase auth in this feature branch.',
      },
    });

    await ProjectRepository.saveBranchArchitecture('proj-chat-store', 'feature-auth', applied.architecture);

    const restoredFeature = await ProjectRepository.getBranchArchitecture('proj-chat-store', 'feature-auth');
    const restoredMain = await ProjectRepository.getBranchArchitecture('proj-chat-store', 'main');

    expect(restoredFeature?.architectureDecisions).toHaveLength(1);
    expect(restoredFeature?.architectureDecisions[0].branchId).toBe('feature-auth');
    expect(restoredFeature?.architectureDecisions[0].chatLink?.messageId).toBe('msg-persist-1');
    expect(restoredFeature?.branch.chatThreadId).toBe('branch-chat:proj-chat-store:feature-auth');
    expect(restoredMain?.architectureDecisions).toHaveLength(0);
  });
});

