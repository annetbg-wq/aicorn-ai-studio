// @vitest-environment jsdom
/**
 * Smoke tests for VisualEditBridge.
 *
 * Covers:
 *   - Initial state is 'off'
 *   - enableSelection → mode transitions to 'selecting'
 *   - postMessage 'visual-element-selected' → mode transitions to 'selected'
 *   - Subscribers are notified on every state change
 *   - Subscriber can be unsubscribed
 *   - detach() resets state to 'off'
 *   - Origin guard: message from a different window is ignored
 *   - buildEditPrompt produces a well-formed prompt
 *   - toggle() flips between off and selecting
 *   - dataAttributes are carried through the payload
 *   - buildEditPrompt uses stable data attributes when present
 *   - componentPath appears in the prompt
 *   - siblingIndex / siblingCount / boundedPath carried through payload
 *   - buildEditPrompt uses structural fallback when no stable id present
 *   - _testForceSelected forces state without iframe origin check
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  visualEditBridge,
  type VisualEditState,
  type SelectedElement,
} from '../VisualEditBridge';

// ── Helpers ──────────────────────────────────────────────────────────────────

type MockIframe = HTMLIFrameElement & { __dispatchLoad: () => void };

const mockIframe = (readyState: DocumentReadyState = 'complete'): MockIframe => {
  const postMessage = vi.fn();
  let loadHandler: ((event: Event) => void) | null = null;
  return {
    contentWindow: { postMessage },
    contentDocument: { readyState },
    addEventListener: vi.fn((type: string, handler: EventListenerOrEventListenerObject) => {
      if (type === 'load') {
        loadHandler = typeof handler === 'function'
          ? handler
          : (event: Event) => handler.handleEvent(event);
      }
    }),
    removeEventListener: vi.fn((type: string) => {
      if (type === 'load') loadHandler = null;
    }),
    __dispatchLoad: () => loadHandler?.(new Event('load')),
  } as unknown as MockIframe;
};

/** Minimal valid element — no stable identifiers. */
const sampleElement = (): SelectedElement => ({
  selector:       '#hero',
  tag:            'button',
  text:           'Get started',
  classList:      ['btn', 'btn-primary'],
  inlineStyle:    '',
  rect:           { x: 10, y: 20, width: 120, height: 40 },
  dataAttributes: {},
  siblingIndex:   0,
  siblingCount:   1,
  boundedPath:    'body > div > button',
});

/** Element carrying all stable identity hints. */
const sampleElementWithAttrs = (): SelectedElement => ({
  selector:       '#hero',
  tag:            'button',
  text:           'Get started',
  classList:      ['btn', 'btn-primary'],
  inlineStyle:    '',
  rect:           { x: 10, y: 20, width: 120, height: 40 },
  dataAttributes: {
    'data-testid':      'hero-cta',
    'data-studio-hash': 'abc123',
    'data-figma-id':    'fig-node-42',
  },
  componentPath:  'HeroSection',
  siblingIndex:   0,
  siblingCount:   1,
  boundedPath:    'main > section > button',
});

/** Element with no stable attrs AND no id-based selector — needs structural hint. */
const sampleElementNoId = (): SelectedElement => ({
  selector:       'li.item',
  tag:            'li',
  text:           'Second item',
  classList:      ['item'],
  inlineStyle:    '',
  rect:           { x: 0, y: 100, width: 300, height: 48 },
  dataAttributes: {},
  siblingIndex:   1,   // second among 3 same-tag siblings
  siblingCount:   3,
  boundedPath:    'section > ul > li',
});

/** Dispatch a synthetic postMessage as if it came from the given source window. */
function dispatchSelection(payload: SelectedElement, source: Window | null = window): void {
  const evt = new MessageEvent('message', {
    data:   { type: 'visual-element-selected', payload },
    source,
  });
  window.dispatchEvent(evt);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('VisualEditBridge', () => {
  beforeEach(() => {
    // Always start from a clean slate so tests are independent.
    visualEditBridge.detach();
  });

  it('initial state is off with no selection', () => {
    expect(visualEditBridge.getState()).toEqual({ mode: 'off', selected: null });
  });

  it('enableSelection transitions mode to selecting', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    expect(visualEditBridge.getState().mode).toBe('selecting');
    expect(visualEditBridge.getState().selected).toBeNull();
  });

  it('enableSelection posts visual-select-start to the iframe', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      { type: 'visual-select-start' },
      '*',
    );
  });

  it('enableSelection re-arms on iframe load when the preview is still booting', () => {
    const iframe = mockIframe('loading');
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    expect(iframe.contentWindow!.postMessage).not.toHaveBeenCalledWith(
      { type: 'visual-select-start' },
      '*',
    );

    iframe.__dispatchLoad();

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      { type: 'visual-select-start' },
      '*',
    );
  });

  it('visual-element-selected message transitions to selected', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    const el = sampleElement();
    dispatchSelection(el, iframe.contentWindow as unknown as Window);

    const state = visualEditBridge.getState();
    expect(state.mode).toBe('selected');
    expect(state.selected).toEqual(el);
  });

  it('message from a different window is ignored (origin guard)', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    // Dispatch from a foreign source (window itself, not the iframe contentWindow)
    dispatchSelection(sampleElement(), window);

    // State must remain 'selecting' — no transition to 'selected'
    expect(visualEditBridge.getState().mode).toBe('selecting');
  });

  it('subscribers are notified on state change', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);

    const received: VisualEditState[] = [];
    const unsub = visualEditBridge.subscribe((s) => received.push(s));

    visualEditBridge.enableSelection();
    expect(received).toHaveLength(1);
    expect(received[0].mode).toBe('selecting');

    unsub();
    // After unsubscribing, further changes are NOT delivered.
    dispatchSelection(sampleElement(), iframe.contentWindow as unknown as Window);
    expect(received).toHaveLength(1); // still 1, not 2
  });

  it('detach resets state to off', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    visualEditBridge.detach();

    expect(visualEditBridge.getState()).toEqual({ mode: 'off', selected: null });
  });

  it('toggle: off → selecting → off', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);

    visualEditBridge.toggle();
    expect(visualEditBridge.getState().mode).toBe('selecting');

    visualEditBridge.toggle();
    expect(visualEditBridge.getState().mode).toBe('off');
  });

  // ── _testForceSelected ────────────────────────────────────────────────────

  it('_testForceSelected transitions to selected without iframe handshake', () => {
    // Does NOT need an attached iframe — bypasses origin guard for test injection
    const el = sampleElement();
    visualEditBridge._testForceSelected(el);

    const state = visualEditBridge.getState();
    expect(state.mode).toBe('selected');
    expect(state.selected).toEqual(el);
  });

  it('_testForceSelected notifies subscribers', () => {
    const received: VisualEditState[] = [];
    const unsub = visualEditBridge.subscribe((s) => received.push(s));

    visualEditBridge._testForceSelected(sampleElement());

    expect(received).toHaveLength(1);
    expect(received[0].mode).toBe('selected');
    unsub();
  });

  // ── dataAttributes passthrough ────────────────────────────────────────────

  it('selected payload preserves dataAttributes when present', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    const el = sampleElementWithAttrs();
    dispatchSelection(el, iframe.contentWindow as unknown as Window);

    const selected = visualEditBridge.getState().selected!;
    expect(selected.dataAttributes['data-testid']).toBe('hero-cta');
    expect(selected.dataAttributes['data-studio-hash']).toBe('abc123');
    expect(selected.dataAttributes['data-figma-id']).toBe('fig-node-42');
  });

  it('selected payload preserves empty dataAttributes object', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    const el = sampleElement();
    dispatchSelection(el, iframe.contentWindow as unknown as Window);

    expect(visualEditBridge.getState().selected?.dataAttributes).toEqual({});
  });

  it('selected payload preserves componentPath when present', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    dispatchSelection(sampleElementWithAttrs(), iframe.contentWindow as unknown as Window);

    expect(visualEditBridge.getState().selected?.componentPath).toBe('HeroSection');
  });

  it('componentPath is undefined when absent', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    dispatchSelection(sampleElement(), iframe.contentWindow as unknown as Window);

    expect(visualEditBridge.getState().selected?.componentPath).toBeUndefined();
  });

  // ── siblingIndex / siblingCount / boundedPath passthrough ─────────────────

  it('selected payload preserves siblingIndex and siblingCount', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    const el = sampleElementNoId();
    dispatchSelection(el, iframe.contentWindow as unknown as Window);

    const selected = visualEditBridge.getState().selected!;
    expect(selected.siblingIndex).toBe(1);
    expect(selected.siblingCount).toBe(3);
  });

  it('selected payload preserves boundedPath', () => {
    const iframe = mockIframe();
    visualEditBridge.attach(iframe);
    visualEditBridge.enableSelection();

    const el = sampleElementNoId();
    dispatchSelection(el, iframe.contentWindow as unknown as Window);

    expect(visualEditBridge.getState().selected?.boundedPath).toBe('section > ul > li');
  });

  it('siblingCount defaults to 1 for unique elements', () => {
    const el = sampleElement(); // siblingCount: 1
    visualEditBridge._testForceSelected(el);
    expect(visualEditBridge.getState().selected?.siblingCount).toBe(1);
  });

  // ── buildEditPrompt ───────────────────────────────────────────────────────

  describe('buildEditPrompt', () => {
    it('includes [Visual Edit] tag', () => {
      const prompt = visualEditBridge.buildEditPrompt(sampleElement(), 'change color to red');
      expect(prompt).toMatch(/\[Visual Edit\]/);
    });

    it('includes the selector when no stable data attribute is present', () => {
      const prompt = visualEditBridge.buildEditPrompt(sampleElement(), 'make it bold');
      expect(prompt).toContain('#hero');
    });

    it('includes the edit description', () => {
      const prompt = visualEditBridge.buildEditPrompt(sampleElement(), 'make it bold');
      expect(prompt).toContain('make it bold');
    });

    it('includes element text excerpt when present', () => {
      const prompt = visualEditBridge.buildEditPrompt(sampleElement(), 'resize');
      expect(prompt).toContain('Get started');
    });

    it('falls back to tag when selector is empty', () => {
      const el: SelectedElement = { ...sampleElement(), selector: '' };
      const prompt = visualEditBridge.buildEditPrompt(el, 'paint it blue');
      expect(prompt).toContain('<button>');
    });

    it('prefers data-testid over selector', () => {
      const el = sampleElementWithAttrs();
      const prompt = visualEditBridge.buildEditPrompt(el, 'change color');
      expect(prompt).toContain('data-testid="hero-cta"');
      // The fragile CSS selector should NOT appear when a stable attr is found
      expect(prompt).not.toContain('#hero');
    });

    it('falls back to data-studio-hash when data-testid is absent', () => {
      const el: SelectedElement = {
        ...sampleElementWithAttrs(),
        dataAttributes: { 'data-studio-hash': 'abc123' },
      };
      const prompt = visualEditBridge.buildEditPrompt(el, 'resize');
      expect(prompt).toContain('data-studio-hash="abc123"');
    });

    it('falls back to data-figma-id when testid and hash are absent', () => {
      const el: SelectedElement = {
        ...sampleElementWithAttrs(),
        dataAttributes: { 'data-figma-id': 'fig-node-42' },
      };
      const prompt = visualEditBridge.buildEditPrompt(el, 'resize');
      expect(prompt).toContain('data-figma-id="fig-node-42"');
    });

    it('includes componentPath hint when present', () => {
      const prompt = visualEditBridge.buildEditPrompt(sampleElementWithAttrs(), 'resize');
      expect(prompt).toContain('[component: HeroSection]');
    });

    it('does not include component hint when componentPath is absent', () => {
      const prompt = visualEditBridge.buildEditPrompt(sampleElement(), 'resize');
      expect(prompt).not.toContain('[component:');
    });

    // ── Structural fallback ───────────────────────────────────────────────

    it('adds structural path hint when no stable attr and selector is class-based', () => {
      // sampleElementNoId has no data attrs, selector 'li.item' (not #id-based)
      const prompt = visualEditBridge.buildEditPrompt(sampleElementNoId(), 'change color');
      expect(prompt).toContain('[path: section > ul > li');
    });

    it('includes sibling position when siblingCount > 1', () => {
      const prompt = visualEditBridge.buildEditPrompt(sampleElementNoId(), 'change color');
      // siblingIndex=1 → "item 2 of 3"
      expect(prompt).toContain('item 2 of 3');
    });

    it('omits sibling position when element is unique (siblingCount=1)', () => {
      // sampleElement has siblingCount:1
      const prompt = visualEditBridge.buildEditPrompt(
        { ...sampleElement(), selector: 'div.wrapper' }, // class-based, no data attrs
        'hide it',
      );
      // boundedPath present but sibling info should NOT appear
      expect(prompt).not.toContain('of 1');
      expect(prompt).not.toContain('item 1 of');
    });

    it('does NOT add structural hint when stable data-testid is present', () => {
      // Stable id makes structural hint unnecessary — keep prompt clean
      const prompt = visualEditBridge.buildEditPrompt(sampleElementWithAttrs(), 'resize');
      expect(prompt).not.toContain('[path:');
    });

    it('does NOT add structural hint when selector is id-based (#id)', () => {
      // #id selectors are already stable — no need for structural hint
      const el: SelectedElement = {
        ...sampleElementNoId(),
        selector: '#unique-element',
        dataAttributes: {},
      };
      const prompt = visualEditBridge.buildEditPrompt(el, 'resize');
      expect(prompt).not.toContain('[path:');
    });

    it('adds structural hint when selector is empty and no data attrs', () => {
      const el: SelectedElement = {
        ...sampleElementNoId(),
        selector:    '',
        dataAttributes: {},
      };
      const prompt = visualEditBridge.buildEditPrompt(el, 'change font');
      expect(prompt).toContain('[path: section > ul > li');
    });
  });
});
