// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { VisualBankModule } from './VisualBankModule';

describe('VisualBankModule premium bank view', () => {
  it('renders premium source audit, coverage, and at least twenty premium component cards', () => {
    const { container } = render(<VisualBankModule />);

    expect(screen.getByTestId('visual-bank-premium-panel')).toBeInTheDocument();
    expect(screen.getByTestId('premium-source-shadcn-ui')).toBeInTheDocument();
    const cards = container.querySelectorAll('[data-testid^="premium-component-card-"]');
    expect(cards.length).toBeGreaterThanOrEqual(20);
    expect(screen.getByTestId('preview-premium-landing-hero-gradient-01')).toBeInTheDocument();
  });
});
