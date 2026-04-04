// ── Figma Layout Tokens ────────────────────────────────────────────────────────

export interface LayoutToken {
  padding: string | number;
  spacing: string | number;
  alignment: 'start' | 'center' | 'end' | 'stretch';
}

export const FigmaLayoutTokens: Record<string, LayoutToken> = {
  photo: {
    padding: 16,
    spacing: 8,
    alignment: 'center',
  },
  icon: {
    padding: 8,
    spacing: 4,
    alignment: 'center',
  },
  text: {
    padding: 12,
    spacing: 6,
    alignment: 'start',
  },
  component: {
    padding: 16,
    spacing: 8,
    alignment: 'stretch',
  },
};
