import {
  getTrendIdeaText,
  type ProductBlueprint,
  type TrendNicheIdea,
} from './ideaFeedService';

export interface TrendIdeaLaunchDeps {
  launchWithPlan: (plan: ProductBlueprint, intent: string, source: 'trend-niche') => Promise<void>;
  addSystemMessage: (message: string) => void;
  setInput: (value: string) => void;
  onSend: (overridePrompt?: string) => void;
  scheduleSend?: (callback: () => void) => void;
}

export function buildTrendIdeaLaunchSummary(
  idea: TrendNicheIdea,
  blueprint: ProductBlueprint,
  language?: string,
): string {
  const copy = getTrendIdeaText(idea, language);
  return [
    `🧠 Blueprint packaged: **${blueprint.appName || copy.title}**`,
    '',
    `Market angle: ${copy.marketAngle}`,
    `Why now: ${copy.whyInteresting}`,
    `Files planned: ${blueprint.fileArchitecture?.length ?? 0}`,
  ].join('\n');
}

export async function launchTrendIdeaBuild(input: {
  idea: TrendNicheIdea;
  blueprint: ProductBlueprint;
  intent: string;
  language?: string;
  deps: TrendIdeaLaunchDeps;
}): Promise<void> {
  const normalizedIntent = input.intent.trim();
  if (!normalizedIntent) {
    throw new Error('Packaged trend idea launch requires a non-empty intent.');
  }

  await input.deps.launchWithPlan(input.blueprint, normalizedIntent, 'trend-niche');
  input.deps.addSystemMessage(buildTrendIdeaLaunchSummary(input.idea, input.blueprint, input.language));
  input.deps.setInput(normalizedIntent);

  const scheduleSend = input.deps.scheduleSend ?? ((callback: () => void) => {
    setTimeout(callback, 0);
  });
  scheduleSend(() => {
    input.deps.onSend(normalizedIntent);
  });
}