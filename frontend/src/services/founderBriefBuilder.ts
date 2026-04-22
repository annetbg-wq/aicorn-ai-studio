import {
  getTrendIdeaText,
  type TrendNicheIdea,
} from './ideaFeedService';

const LABELS: Record<string, Record<string, string>> = {
  en: {
    heading: 'Founder-ready brief for product architect',
    title: 'Title',
    essence: 'Essence',
    audience: 'Target audience',
    marketAngle: 'Market angle',
    whyInteresting: 'Why this idea is interesting',
    comment: 'User comment',
    instruction: 'Use this structured brief as the starting context. Do not create a saved project until a live preview exists and the user explicitly saves it.',
  },
  ru: {
    heading: 'Founder-ready brief для продуктового архитектора',
    title: 'Название',
    essence: 'Суть',
    audience: 'Целевая аудитория',
    marketAngle: 'Рыночный угол',
    whyInteresting: 'Чем идея интересна',
    comment: 'Комментарий пользователя',
    instruction: 'Используй этот структурированный brief как стартовый контекст. Не создавай сохраненный проект, пока не появится live preview и пользователь явно не нажмет Save.',
  },
};

function labelsFor(language?: string): Record<string, string> {
  const lang = (language || 'en').toLowerCase().split('-')[0];
  return LABELS[lang] ?? LABELS.en;
}

export function buildFounderReadyBrief(input: {
  idea: TrendNicheIdea;
  language?: string;
  userComment?: string;
}): string {
  const labels = labelsFor(input.language);
  const copy = getTrendIdeaText(input.idea, input.language);
  const comment = input.userComment?.trim();
  const lines = [
    labels.heading,
    '',
    `${labels.title}: ${copy.title}`,
    `${labels.essence}: ${copy.description}`,
    `${labels.audience}: ${copy.audience}`,
    `${labels.marketAngle}: ${copy.marketAngle}`,
    `${labels.whyInteresting}: ${copy.whyInteresting}`,
  ];

  if (comment) {
    lines.push(`${labels.comment}: ${comment}`);
  }

  lines.push('', labels.instruction);
  return lines.join('\n');
}
