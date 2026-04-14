import {
  CATEGORIES,
  type CategoryId,
  getAllCategories,
  type StyleId,
} from './categories';
import { getAllStyles } from './styles';

export interface ClassificationResult {
  category: CategoryId;
  style: StyleId;
  confidence: number;
  reasoning: string;
  alternativeCategory?: CategoryId;
  alternativeStyle?: StyleId;
}

function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && value in CATEGORIES;
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }
}

function parseClassifierResponse(raw: string): ClassificationResult | null {
  const json = extractJsonObject(raw);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as {
      category?: unknown;
      style?: unknown;
      confidence?: unknown;
      reasoning?: unknown;
      alternativeCategory?: unknown;
      alternativeStyle?: unknown;
    };

    if (!isCategoryId(parsed.category)) {
      return null;
    }

    const categoryMeta = CATEGORIES[parsed.category];
    const safeStyle =
      typeof parsed.style === 'string' &&
      categoryMeta.allowedStyles.includes(parsed.style as StyleId)
        ? (parsed.style as StyleId)
        : categoryMeta.defaultStyle;

    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : safeStyle === categoryMeta.defaultStyle
        ? 0.7
        : 0.8;

    const alternativeCategory = isCategoryId(parsed.alternativeCategory)
      ? parsed.alternativeCategory
      : undefined;

    const alternativeStyle =
      typeof parsed.alternativeStyle === 'string'
        ? (parsed.alternativeStyle as StyleId)
        : undefined;

    return {
      category: parsed.category,
      style: safeStyle,
      confidence,
      reasoning:
        typeof parsed.reasoning === 'string' && parsed.reasoning.trim().length > 0
          ? parsed.reasoning.trim()
          : 'Classified by model response',
      alternativeCategory,
      alternativeStyle,
    };
  } catch {
    return null;
  }
}

export async function classifyIdea(
  idea: string,
  apiKey: string
): Promise<ClassificationResult> {
  const classifierPrompt = `You are a design system classifier for a React prototype generator.

Analyze this app idea and classify it:
"${idea}"

Available categories:
${getAllCategories()
  .map(
    c =>
      `- ${c.id}: ${c.description} [keywords: ${c.keywords
        .slice(0, 5)
        .join(', ')}]`
  )
  .join('\n')}

Available styles:
${getAllStyles()
  .map(s => `- ${s.id}: ${s.description}`)
  .join('\n')}

Respond ONLY with valid JSON, no markdown:
{
  "category": "category-id",
  "style": "style-id",
  "confidence": 0.95,
  "reasoning": "one sentence why",
  "alternativeCategory": "other-category-id or null",
  "alternativeStyle": "other-style-id or null"
}

Rules:
- Pick the MOST specific category that fits
- Style must be in the category's allowedStyles
- If unclear, use the category's defaultStyle
- confidence 0.9+ means obvious match, 0.6-0.9 reasonable, <0.6 uncertain`;

  // Classification is done entirely via keyword matching in fallbackClassify.
  // A direct browser → api.anthropic.com call is blocked by CORS, and routing
  // the classifier through the studio's model picker would entangle this
  // light-weight prefilter with the main LLM pipeline. Keyword matching is
  // accurate enough for the design-system category/style prefilter.
  // `apiKey` is kept in the signature for call-site compatibility.
  return fallbackClassify(idea);
}

export function fallbackClassify(idea: string): ClassificationResult {
  const lowerIdea = idea.toLowerCase();
  let bestMatch = { category: 'task-manager' as CategoryId, score: 0 };

  for (const cat of getAllCategories()) {
    const score = cat.keywords.filter(kw =>
      lowerIdea.includes(kw.toLowerCase())
    ).length;

    if (score > bestMatch.score) {
      bestMatch = { category: cat.id, score };
    }
  }

  const category = CATEGORIES[bestMatch.category];

  return {
    category: bestMatch.category,
    style: category.defaultStyle,
    confidence: bestMatch.score > 0 ? 0.5 : 0.3,
    reasoning: 'Classified by keyword matching (fallback)',
  };
}
