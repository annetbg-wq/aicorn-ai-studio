import {
  canTransitionArchitectureStatus,
  createProjectBranchArchitecture,
  type ArchitectureCapabilityKey,
  type ArchitectureConstraint,
  type ArchitectureDecision,
  type ArchitectureStatus,
  type BranchConversationLinkage,
  type ChatDerivedArchitectureItemType,
  type DeferredItem,
  type OpenArchitectureQuestion,
  type ProjectBranchArchitecture,
} from '../shared/projectModel';

type SupportedMessageRole = 'user' | 'assistant' | 'system';
type SupportedMessageType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'text'
  | 'clarification'
  | 'error'
  | 'info';

export interface ChatArchitectureMessage {
  id: string;
  role: SupportedMessageRole;
  type?: string;
  content: string | Array<{ type?: string; text?: string }>;
  timestamp: number;
}

export interface ApplyChatArchitectureMessageInput {
  projectId: string;
  branchId: string;
  branchName?: string;
  language?: string;
  message: ChatArchitectureMessage;
  architecture?: ProjectBranchArchitecture | null;
}

export interface ApplyChatArchitectureMessageResult {
  changed: boolean;
  architecture: ProjectBranchArchitecture;
  extractedItemIds: string[];
  chatThreadId: string;
  conversationRef: string;
}

type CreateOperation = {
  mode: 'create';
  itemType: Exclude<ChatDerivedArchitectureItemType, 'superseded_decision'>;
  status?: ArchitectureStatus;
  text: string;
};

type TransitionOperation =
  | { mode: 'accept_decision'; title: string }
  | { mode: 'accept_question'; title: string }
  | { mode: 'defer_decision'; title: string }
  | { mode: 'supersede_decision'; title: string; replacementText?: string };

type ExtractedOperation = CreateOperation | TransitionOperation;

const IGNORED_MESSAGE_TYPES = new Set<string>([
  'blueprint',
  'generation-report',
]);

const ARCHITECTURE_KEYWORDS = [
  /\bauth\b/i,
  /\blogin\b/i,
  /\bsession\b/i,
  /\bsupabase\b/i,
  /\bbackend\b/i,
  /\bapi\b/i,
  /\bdatabase\b/i,
  /\bdb\b/i,
  /\bstorage\b/i,
  /\bcache\b/i,
  /\brouter?\b/i,
  /\broutes?\b/i,
  /\bnotifications?\b/i,
  /\banalytics\b/i,
  /\bpayments?\b/i,
  /\bstripe\b/i,
  /\badmin\b/i,
  /\bscanner\b/i,
  /\bmap\b/i,
  /\ba[.]?i[.]?\b/i,
  /\bllm\b/i,
  /\bchatbot\b/i,
  /\bassistant\b/i,
  /\bархитект/i,
  /\bаутент/i,
  /\bавториза/i,
  /\bбэкенд/i,
  /\bсервер/i,
  /\bбаз/i,
  /\bмаршрут/i,
  /\bуведом/i,
  /\bаналитик/i,
  /\bоплат/i,
  /\bадмин/i,
  /\bкарта\b/i,
  /\bсканер/i,
  /\bчат\b/i,
  /\bмодел/i,
];

const CAPABILITY_RULES: Array<{ capabilityId: ArchitectureCapabilityKey; patterns: RegExp[] }> = [
  {
    capabilityId: 'auth',
    patterns: [/\bauth\b/i, /\blogin\b/i, /\bsession\b/i, /\bаутент/i, /\bавториза/i],
  },
  {
    capabilityId: 'backend',
    patterns: [/\bbackend\b/i, /\bserver\b/i, /\bapi\b/i, /\bdatabase\b/i, /\bsupabase\b/i, /\bбэкенд/i, /\bсервер/i, /\bбаз/i],
  },
  {
    capabilityId: 'ai_chat',
    patterns: [/\bchatbot\b/i, /\bassistant\b/i, /\bconversation\b/i, /\bчат-?бот/i, /\bассистент/i],
  },
  {
    capabilityId: 'ai_generation',
    patterns: [/\bgeneration\b/i, /\bprompt\b/i, /\bllm\b/i, /\bmodel\b/i, /\bгенерац/i, /\bмодел/i],
  },
  {
    capabilityId: 'storage',
    patterns: [/\bstorage\b/i, /\bcache\b/i, /\bbucket\b/i, /\bхранили/i, /\bкеш/i],
  },
  {
    capabilityId: 'map',
    patterns: [/\bmap\b/i, /\bmaps\b/i, /\bкарта\b/i, /\bкарты\b/i],
  },
  {
    capabilityId: 'scanner',
    patterns: [/\bscanner\b/i, /\bscan\b/i, /\bсканер/i, /\bскан/i],
  },
  {
    capabilityId: 'notifications',
    patterns: [/\bnotification\b/i, /\bemail\b/i, /\bpush\b/i, /\bуведом/i],
  },
  {
    capabilityId: 'analytics',
    patterns: [/\banalytics\b/i, /\btracking\b/i, /\bposthog\b/i, /\bаналитик/i, /\bтрекинг/i],
  },
  {
    capabilityId: 'payments',
    patterns: [/\bpayment\b/i, /\bbilling\b/i, /\bstripe\b/i, /\bоплат/i, /\bбиллинг/i],
  },
  {
    capabilityId: 'admin',
    patterns: [/\badmin\b/i, /\bmoderation\b/i, /\bадмин/i, /\bмодерац/i],
  },
];

function getMessageText(content: ChatArchitectureMessage['content']): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`"'«»“”„]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function toConversationRef(projectId: string, branchId: string): string {
  return `branch-chat:${projectId}:${branchId}`;
}

function buildChatLink(
  message: ChatArchitectureMessage,
  chatThreadId: string,
  conversationRef: string,
  itemType: ChatDerivedArchitectureItemType,
  language: string,
): BranchConversationLinkage {
  return {
    source: 'branch_chat',
    conversationRef,
    chatThreadId,
    messageId: message.id,
    messageTimestamp: message.timestamp,
    messageRole: message.role,
    itemType,
    extractedLanguage: language,
  };
}

function buildTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const firstChunk = normalized.split(/(?<=[.!?])\s+|[:;]\s+| — | – | - /)[0]?.trim() ?? normalized;
  return firstChunk.length > 96 ? `${firstChunk.slice(0, 93).trim()}...` : firstChunk;
}

function detectCapabilities(text: string): ArchitectureCapabilityKey[] {
  const ids = new Set<ArchitectureCapabilityKey>();
  for (const rule of CAPABILITY_RULES) {
    if (rule.patterns.some(pattern => pattern.test(text))) {
      ids.add(rule.capabilityId);
    }
  }
  return [...ids];
}

function detectDecisionCategory(text: string): ArchitectureDecision['category'] {
  if (/\b(auth|security|permission|token|secret|secure|аутент|авториза|безопас)/i.test(text)) return 'security';
  if (/\b(data|database|schema|storage|cache|баз|данн|схем|хранили)/i.test(text)) return 'data';
  if (/\b(api|integration|webhook|third-party|external|интеграц|api)/i.test(text)) return 'integration';
  if (/\b(deploy|release|ci\b|cd\b|build|preview|доставк|релиз|сборк)/i.test(text)) return 'delivery';
  if (/\b(ui|ux|screen|layout|flow|экран|интерфейс|ux)\b/i.test(text)) return 'ux';
  if (/\b(server|backend|architecture|module|service|бэкенд|сервер|модул|сервис|архитект)/i.test(text)) return 'system';
  return 'other';
}

function detectConstraintType(text: string): ArchitectureConstraint['constraintType'] {
  if (/\b(deadline|timeline|milestone|release|срок|дедлайн|этап)/i.test(text)) return 'timeline';
  if (/\b(compliance|gdpr|pci|policy|legal|регламент|комплаенс|политик)/i.test(text)) return 'compliance';
  if (/\b(team|resource|budget|capacity|команда|ресурс|бюджет)/i.test(text)) return 'resource';
  if (/\b(product|scope|mvp|roadmap|продукт|объем|mvp|roadmap)/i.test(text)) return 'product';
  if (/\b(api|infra|hosting|database|types|tech|stack|тех|стек|infra|баз)/i.test(text)) return 'technical';
  return 'other';
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function parseBracketDirective(line: string): ExtractedOperation | null {
  const match = line.match(/^\[(decision|constraint|question|deferred|accept-decision|accept-question|defer-decision|supersede-decision)(?::(proposed|accepted|open|deferred|superseded))?\]\s*(.+)$/i);
  if (!match) return null;

  const directive = match[1].toLowerCase();
  const hintedStatus = match[2]?.toLowerCase() as ArchitectureStatus | undefined;
  const body = match[3].trim();

  switch (directive) {
    case 'decision':
      return { mode: 'create', itemType: 'architecture_decision', status: hintedStatus ?? 'proposed', text: body };
    case 'constraint':
      return { mode: 'create', itemType: 'architecture_constraint', status: hintedStatus ?? 'accepted', text: body };
    case 'question':
      return { mode: 'create', itemType: 'open_architecture_question', status: hintedStatus ?? 'open', text: body };
    case 'deferred':
      return { mode: 'create', itemType: 'deferred_item', status: hintedStatus ?? 'deferred', text: body };
    case 'accept-decision':
      return { mode: 'accept_decision', title: body };
    case 'accept-question':
      return { mode: 'accept_question', title: body };
    case 'defer-decision':
      return { mode: 'defer_decision', title: body };
    case 'supersede-decision': {
      const [title, replacementText] = body.split(/\s*(?:=>|->|→)\s*/);
      return {
        mode: 'supersede_decision',
        title: title?.trim() ?? body,
        replacementText: replacementText?.trim(),
      };
    }
    default:
      return null;
  }
}

function parsePrefixedDirective(line: string): ExtractedOperation | null {
  const prefixRules: Array<{ regex: RegExp; resolve: (body: string) => ExtractedOperation | null }> = [
    {
      regex: /^(?:accepted decision|accept decision|принять решение|принятое решение)\s*:\s*(.+)$/i,
      resolve: body => ({ mode: 'accept_decision', title: body.trim() }),
    },
    {
      regex: /^(?:resolved question|accept question|закрыть вопрос|решенный вопрос)\s*:\s*(.+)$/i,
      resolve: body => ({ mode: 'accept_question', title: body.trim() }),
    },
    {
      regex: /^(?:defer decision|отложить решение)\s*:\s*(.+)$/i,
      resolve: body => ({ mode: 'defer_decision', title: body.trim() }),
    },
    {
      regex: /^(?:supersede decision|replace decision|заменить решение)\s*:\s*(.+)$/i,
      resolve: body => {
        const [title, replacementText] = body.split(/\s*(?:=>|->|→)\s*/);
        return {
          mode: 'supersede_decision',
          title: title?.trim() ?? body.trim(),
          replacementText: replacementText?.trim(),
        };
      },
    },
    {
      regex: /^(?:architecture decision|decision|архитектурное решение|решение)\s*:\s*(.+)$/i,
      resolve: body => ({ mode: 'create', itemType: 'architecture_decision', status: 'proposed', text: body.trim() }),
    },
    {
      regex: /^(?:architecture constraint|constraint|архитектурное ограничение|ограничение)\s*:\s*(.+)$/i,
      resolve: body => ({ mode: 'create', itemType: 'architecture_constraint', status: 'accepted', text: body.trim() }),
    },
    {
      regex: /^(?:open question|question|открытый вопрос|вопрос)\s*:\s*(.+)$/i,
      resolve: body => ({ mode: 'create', itemType: 'open_architecture_question', status: 'open', text: body.trim() }),
    },
    {
      regex: /^(?:deferred item|deferred|отложенный пункт|отложено)\s*:\s*(.+)$/i,
      resolve: body => ({ mode: 'create', itemType: 'deferred_item', status: 'deferred', text: body.trim() }),
    },
  ];

  for (const rule of prefixRules) {
    const match = line.match(rule.regex);
    if (match?.[1]) return rule.resolve(match[1]);
  }

  return null;
}

function parseHeuristicDirective(line: string): ExtractedOperation | null {
  if (!ARCHITECTURE_KEYWORDS.some(pattern => pattern.test(line))) return null;

  if (/\?$/.test(line)) {
    return { mode: 'create', itemType: 'open_architecture_question', status: 'open', text: line };
  }

  if (/\b(must|cannot|can't|without|avoid|required|должн|нельзя|без|избега|обязательно)\b/i.test(line)) {
    return { mode: 'create', itemType: 'architecture_constraint', status: 'accepted', text: line };
  }

  if (/\b(defer|later|postpone|after mvp|после mvp|позже|отлож)/i.test(line)) {
    return { mode: 'create', itemType: 'deferred_item', status: 'deferred', text: line };
  }

  if (/\b(we(?:'ll| will)? use|use\b|choose|chosen|decide|decided|going with|берем|выбираем|решили|используем)\b/i.test(line)) {
    return { mode: 'create', itemType: 'architecture_decision', status: 'proposed', text: line };
  }

  return null;
}

function extractOperations(message: ChatArchitectureMessage): ExtractedOperation[] {
  const text = getMessageText(message.content);
  if (!text) return [];

  const operations = splitLines(text)
    .map(line => parseBracketDirective(line) ?? parsePrefixedDirective(line) ?? parseHeuristicDirective(line))
    .filter((operation): operation is ExtractedOperation => Boolean(operation));

  return operations;
}

function hasExistingChatLink<T extends { chatLink?: BranchConversationLinkage; title?: string }>(
  entries: T[],
  messageId: string,
  itemType: ChatDerivedArchitectureItemType,
  title?: string,
): boolean {
  const normalizedTitle = title ? normalizeComparableText(title) : null;
  return entries.some(entry =>
    entry.chatLink?.messageId === messageId
    && entry.chatLink?.itemType === itemType
    && (
      !normalizedTitle
      || !entry.title
      || normalizeComparableText(entry.title) === normalizedTitle
    ),
  );
}

function findDecisionByTitle(
  architecture: ProjectBranchArchitecture,
  title: string,
): ArchitectureDecision | undefined {
  const normalizedTitle = normalizeComparableText(title);
  return architecture.architectureDecisions.find(entry => normalizeComparableText(entry.title) === normalizedTitle);
}

function findQuestionByTitle(
  architecture: ProjectBranchArchitecture,
  title: string,
): OpenArchitectureQuestion | undefined {
  const normalizedTitle = normalizeComparableText(title);
  return architecture.openQuestions.find(entry => normalizeComparableText(entry.title) === normalizedTitle);
}

function findDeferredByTitle(
  architecture: ProjectBranchArchitecture,
  title: string,
): DeferredItem | undefined {
  const normalizedTitle = normalizeComparableText(title);
  return architecture.deferredItems.find(entry => normalizeComparableText(entry.title) === normalizedTitle);
}

function upsertDecision(
  architecture: ProjectBranchArchitecture,
  entry: ArchitectureDecision,
): void {
  const existingIndex = architecture.architectureDecisions.findIndex(existing => existing.id === entry.id);
  if (existingIndex >= 0) architecture.architectureDecisions[existingIndex] = entry;
  else architecture.architectureDecisions.push(entry);
}

function upsertQuestion(
  architecture: ProjectBranchArchitecture,
  entry: OpenArchitectureQuestion,
): void {
  const existingIndex = architecture.openQuestions.findIndex(existing => existing.id === entry.id);
  if (existingIndex >= 0) architecture.openQuestions[existingIndex] = entry;
  else architecture.openQuestions.push(entry);
}

function upsertDeferred(
  architecture: ProjectBranchArchitecture,
  entry: DeferredItem,
): void {
  const existingIndex = architecture.deferredItems.findIndex(existing => existing.id === entry.id);
  if (existingIndex >= 0) architecture.deferredItems[existingIndex] = entry;
  else architecture.deferredItems.push(entry);
}

function upsertConstraint(
  architecture: ProjectBranchArchitecture,
  entry: ArchitectureConstraint,
): void {
  const existingIndex = architecture.constraints.findIndex(existing => existing.id === entry.id);
  if (existingIndex >= 0) architecture.constraints[existingIndex] = entry;
  else architecture.constraints.push(entry);
}

function sortArchitectureItems(architecture: ProjectBranchArchitecture): void {
  architecture.architectureDecisions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  architecture.constraints.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  architecture.openQuestions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  architecture.deferredItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const ChatArchitectureService = {
  extractOperations,

  applyMessage(input: ApplyChatArchitectureMessageInput): ApplyChatArchitectureMessageResult {
    const baseArchitecture = input.architecture
      ? {
          ...input.architecture,
          architectureDecisions: [...input.architecture.architectureDecisions],
          constraints: [...input.architecture.constraints],
          openQuestions: [...input.architecture.openQuestions],
          deferredItems: [...input.architecture.deferredItems],
          snapshots: [...input.architecture.snapshots],
        }
      : createProjectBranchArchitecture(
          input.projectId,
          input.branchId,
          input.branchName ?? input.branchId,
        );

    if (input.message.type && IGNORED_MESSAGE_TYPES.has(input.message.type)) {
      return {
        changed: false,
        architecture: baseArchitecture,
        extractedItemIds: [],
        chatThreadId: baseArchitecture.branch.chatThreadId ?? toConversationRef(input.projectId, input.branchId),
        conversationRef: toConversationRef(input.projectId, input.branchId),
      };
    }

    const operations = extractOperations(input.message);
    const language = input.language ?? 'en';
    const chatThreadId = baseArchitecture.branch.chatThreadId ?? toConversationRef(input.projectId, input.branchId);
    const conversationRef = toConversationRef(input.projectId, input.branchId);
    const extractedItemIds = new Set<string>();
    let changed = false;

    baseArchitecture.branch = {
      ...baseArchitecture.branch,
      branchName: baseArchitecture.branch.branchName || input.branchName || input.branchId,
      chatThreadId,
      updatedAt: new Date(input.message.timestamp).toISOString(),
    };

    operations.forEach((operation, index) => {
      const updatedAt = new Date(input.message.timestamp + index).toISOString();

      if (operation.mode === 'create') {
        const title = buildTitle(operation.text);
        const capabilities = detectCapabilities(operation.text);
        const baseId = `chat-architecture:${input.branchId}:${input.message.id}:${operation.itemType}:${index}`;
        const chatLink = buildChatLink(input.message, chatThreadId, conversationRef, operation.itemType, language);

        if (operation.itemType === 'architecture_decision') {
          if (hasExistingChatLink(baseArchitecture.architectureDecisions, input.message.id, operation.itemType, title)) return;
          upsertDecision(baseArchitecture, {
            id: baseId,
            projectId: input.projectId,
            branchId: input.branchId,
            phase: 'pre_build_draft',
            title,
            summary: operation.text.trim(),
            status: operation.status ?? 'proposed',
            source: 'branch_chat',
            chatLink,
            category: detectDecisionCategory(operation.text),
            affectedCapabilityIds: capabilities,
            createdAt: updatedAt,
            updatedAt,
          });
          extractedItemIds.add(baseId);
          changed = true;
          return;
        }

        if (operation.itemType === 'architecture_constraint') {
          if (hasExistingChatLink(baseArchitecture.constraints, input.message.id, operation.itemType, title)) return;
          upsertConstraint(baseArchitecture, {
            id: baseId,
            projectId: input.projectId,
            branchId: input.branchId,
            phase: 'pre_build_draft',
            title,
            summary: operation.text.trim(),
            status: operation.status ?? 'accepted',
            source: 'branch_chat',
            chatLink,
            constraintType: detectConstraintType(operation.text),
            affectedCapabilityIds: capabilities,
            createdAt: updatedAt,
            updatedAt,
          });
          extractedItemIds.add(baseId);
          changed = true;
          return;
        }

        if (operation.itemType === 'open_architecture_question') {
          if (hasExistingChatLink(baseArchitecture.openQuestions, input.message.id, operation.itemType, title)) return;
          upsertQuestion(baseArchitecture, {
            id: baseId,
            projectId: input.projectId,
            branchId: input.branchId,
            phase: 'pre_build_draft',
            title,
            summary: operation.text.trim(),
            status: operation.status ?? 'open',
            source: 'branch_chat',
            chatLink,
            affectedCapabilityIds: capabilities,
            createdAt: updatedAt,
            updatedAt,
          });
          extractedItemIds.add(baseId);
          changed = true;
          return;
        }

        if (operation.itemType === 'deferred_item') {
          if (hasExistingChatLink(baseArchitecture.deferredItems, input.message.id, operation.itemType, title)) return;
          upsertDeferred(baseArchitecture, {
            id: baseId,
            projectId: input.projectId,
            branchId: input.branchId,
            phase: 'pre_build_draft',
            title,
            summary: operation.text.trim(),
            status:
              operation.status === 'accepted'
                ? 'accepted'
                : operation.status === 'superseded'
                  ? 'superseded'
                  : operation.status === 'open'
                    ? 'open'
                    : 'deferred',
            source: 'branch_chat',
            chatLink,
            relatedCapabilityIds: capabilities,
            createdAt: updatedAt,
            updatedAt,
          });
          extractedItemIds.add(baseId);
          changed = true;
        }

        return;
      }

      if (operation.mode === 'accept_decision') {
        const existing = findDecisionByTitle(baseArchitecture, operation.title);
        if (existing && canTransitionArchitectureStatus(existing.status, 'accepted')) {
          existing.status = 'accepted';
          existing.source = 'branch_chat';
          existing.chatLink = buildChatLink(input.message, chatThreadId, conversationRef, 'architecture_decision', language);
          existing.updatedAt = updatedAt;
          extractedItemIds.add(existing.id);
          changed = true;
        } else if (!existing) {
          const created = this.applyMessage({
            ...input,
            message: {
              ...input.message,
              content: `[decision:accepted] ${operation.title}`,
            },
            architecture: baseArchitecture,
          });
          created.extractedItemIds.forEach(id => extractedItemIds.add(id));
          if (created.changed) changed = true;
        }
        return;
      }

      if (operation.mode === 'accept_question') {
        const existing = findQuestionByTitle(baseArchitecture, operation.title);
        if (existing && canTransitionArchitectureStatus(existing.status, 'accepted')) {
          existing.status = 'accepted';
          existing.source = 'branch_chat';
          existing.chatLink = buildChatLink(input.message, chatThreadId, conversationRef, 'open_architecture_question', language);
          existing.updatedAt = updatedAt;
          extractedItemIds.add(existing.id);
          changed = true;
        }
        return;
      }

      if (operation.mode === 'defer_decision') {
        const existing = findDecisionByTitle(baseArchitecture, operation.title);
        if (existing && canTransitionArchitectureStatus(existing.status, 'deferred')) {
          existing.status = 'deferred';
          existing.source = 'branch_chat';
          existing.chatLink = buildChatLink(input.message, chatThreadId, conversationRef, 'deferred_item', language);
          existing.updatedAt = updatedAt;
          extractedItemIds.add(existing.id);
          changed = true;
        }

        const deferredId = `chat-architecture:${input.branchId}:${input.message.id}:deferred-transition:${index}`;
        if (!hasExistingChatLink(baseArchitecture.deferredItems, input.message.id, 'deferred_item', operation.title)) {
          const fallback = findDeferredByTitle(baseArchitecture, operation.title);
          if (!fallback) {
            upsertDeferred(baseArchitecture, {
              id: deferredId,
              projectId: input.projectId,
              branchId: input.branchId,
              phase: 'pre_build_draft',
              title: existing?.title ?? buildTitle(operation.title),
              summary: existing?.summary ?? operation.title,
              status: 'deferred',
              source: 'branch_chat',
              chatLink: buildChatLink(input.message, chatThreadId, conversationRef, 'deferred_item', language),
              relatedDecisionId: existing?.id,
              relatedCapabilityIds: existing?.affectedCapabilityIds ?? detectCapabilities(operation.title),
              createdAt: updatedAt,
              updatedAt,
            });
            extractedItemIds.add(deferredId);
            changed = true;
          }
        }
        return;
      }

      if (operation.mode === 'supersede_decision') {
        const existing = findDecisionByTitle(baseArchitecture, operation.title);
        if (!existing || !canTransitionArchitectureStatus(existing.status, 'superseded')) return;

        existing.status = 'superseded';
        existing.source = 'branch_chat';
        existing.chatLink = buildChatLink(input.message, chatThreadId, conversationRef, 'superseded_decision', language);
        existing.updatedAt = updatedAt;
        extractedItemIds.add(existing.id);
        changed = true;

        const replacementText = operation.replacementText?.trim();
        if (replacementText) {
          const replacementId = `chat-architecture:${input.branchId}:${input.message.id}:replacement:${index}`;
          if (!baseArchitecture.architectureDecisions.some(entry => entry.id === replacementId)) {
            upsertDecision(baseArchitecture, {
              id: replacementId,
              projectId: input.projectId,
              branchId: input.branchId,
              phase: 'pre_build_draft',
              title: buildTitle(replacementText),
              summary: replacementText,
              status: 'accepted',
              source: 'branch_chat',
              chatLink: buildChatLink(input.message, chatThreadId, conversationRef, 'architecture_decision', language),
              category: detectDecisionCategory(replacementText),
              affectedCapabilityIds: detectCapabilities(replacementText),
              supersedesDecisionId: existing.id,
              createdAt: updatedAt,
              updatedAt,
            });
            extractedItemIds.add(replacementId);
            changed = true;
          }
        }
      }
    });

    baseArchitecture.updatedAt = extractedItemIds.size > 0
      ? new Date(input.message.timestamp).toISOString()
      : baseArchitecture.updatedAt;
    sortArchitectureItems(baseArchitecture);

    return {
      changed,
      architecture: baseArchitecture,
      extractedItemIds: [...extractedItemIds],
      chatThreadId,
      conversationRef,
    };
  },
};
