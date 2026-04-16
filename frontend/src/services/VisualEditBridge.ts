/**
 * VisualEditBridge — Inline visual editing via postMessage between studio and preview iframe.
 *
 * Architecture:
 *   Studio (host)                   Preview iframe (preview-workspace)
 *   ─────────────────               ─────────────────────────────────
 *   enableSelectionMode() ──────→   activates hover/click overlay
 *                          ←──────  'visual-element-selected' { selector, tag, text, styles }
 *   applyEdit()            ──────→  (not used — edits go through file diff flow)
 *
 * Host → iframe messages (type: string):
 *   { type: 'visual-select-start' }   — turn on element picker
 *   { type: 'visual-select-stop' }    — turn off element picker
 *
 * Iframe → host messages (type: string):
 *   { type: 'visual-element-selected', payload: SelectedElement }
 *
 * MVP scope:
 *   - Element selection with CSS selector inference
 *   - Returns element metadata to host for text/class/style edits
 *   - Edits are applied back via the existing diff/revision flow (not direct DOM)
 */

export interface SelectedElement {
  /** CSS selector for the element (best-effort, human-readable) */
  selector:  string;
  /** Tag name (lowercase): div, button, p, h1, img, … */
  tag:       string;
  /** Inner text (trimmed, ≤ 120 chars) */
  text:      string;
  /** Computed class list */
  classList: string[];
  /** Inline style string */
  inlineStyle: string;
  /** Bounding rect in viewport coords */
  rect: { x: number; y: number; width: number; height: number };
  /**
   * Stable data-* attributes present on the element.
   * Includes data-testid, data-studio-hash, data-figma-id and any other
   * data-* attributes written by Fusion Protocol or the user's own code.
   * Keyed by full attribute name, e.g. { 'data-testid': 'hero-button' }.
   */
  dataAttributes: Record<string, string>;
  /**
   * Nearest ancestor's data-component value (if present).
   * Written by Fusion Protocol on component root elements to carry a
   * human-readable component name hint for AI edit targeting.
   */
  componentPath?: string;
  /**
   * 0-based index of this element among same-tag siblings.
   * Combined with siblingCount, lets the AI target "the second button in
   * the nav" even when no unique attributes exist.
   */
  siblingIndex: number;
  /**
   * Total count of same-tag siblings (including this element).
   * siblingCount === 1 means the element is unique in its parent.
   */
  siblingCount: number;
  /**
   * Compact 3-deep ancestor chain using tag names only, e.g. "section > ul > li".
   * Provides lightweight structural context without a full DOM path.
   * Avoids body/html anchors to keep the hint meaningful.
   */
  boundedPath: string;
}

export type VisualEditMode = 'off' | 'selecting' | 'selected';

export interface VisualEditState {
  mode:     VisualEditMode;
  selected: SelectedElement | null;
}

type StateListener = (state: VisualEditState) => void;

class VisualEditBridgeClass {
  private iframe:    HTMLIFrameElement | null = null;
  private state:     VisualEditState = { mode: 'off', selected: null };
  private listeners: Set<StateListener> = new Set();
  private selectionPending = false;

  // ── visual-select-ready synchronisation ─────────────────────────────────
  // The iframe posts 'visual-select-ready' once its click-capture handler is
  // live.  Tests (and any future host code) can call waitForSelectReady() to
  // obtain a Promise that resolves only after that acknowledgement arrives,
  // eliminating the race between postMessage delivery and the first click.
  private _selectReady = false;
  private _selectReadyListeners: Array<() => void> = [];

  private messageHandler = (e: MessageEvent) => {
    if (!e.data || typeof e.data !== 'object') return;

    // ── Iframe acknowledged selection mode ────────────────────────────────
    if (e.data.type === 'visual-select-ready') {
      // Origin guard: only accept from our attached iframe (same as selected).
      if (this.iframe?.contentWindow && e.source !== this.iframe.contentWindow) return;
      this._selectReady = true;
      const listeners = this._selectReadyListeners.splice(0);
      for (const fn of listeners) fn();
      return;
    }

    // ── Element picked by the user ────────────────────────────────────────
    if (e.data.type !== 'visual-element-selected') return;
    // Only accept messages from our currently attached iframe — prevents stale
    // messages from a previous build's iframe from being accepted after navigation.
    if (this.iframe?.contentWindow && e.source !== this.iframe.contentWindow) return;
    const payload = e.data.payload as SelectedElement;
    this.selectionPending = false;
    this.setState({ mode: 'selected', selected: payload });
  };

  private iframeLoadHandler = () => {
    if (!this.selectionPending || !this.iframe?.contentWindow) return;
    this.iframe.contentWindow.postMessage({ type: 'visual-select-start' }, '*');
  };

  private detachIframeListeners(): void {
    if (!this.iframe) return;
    this.iframe.removeEventListener?.('load', this.iframeLoadHandler);
    window.removeEventListener('message', this.messageHandler);
  }

  private isIframeReady(): boolean {
    return this.iframe?.contentDocument?.readyState === 'complete';
  }

  /** Attach to the preview iframe and start listening. */
  attach(iframe: HTMLIFrameElement): void {
    if (this.iframe === iframe) return;
    this.detachIframeListeners();
    this.iframe = iframe;
    this.iframe.addEventListener?.('load', this.iframeLoadHandler);
    window.addEventListener('message', this.messageHandler);
    if (this.selectionPending && this.isIframeReady()) {
      this.iframe.contentWindow?.postMessage({ type: 'visual-select-start' }, '*');
    }
  }

  /** Detach and stop listening. */
  detach(): void {
    this.detachIframeListeners();
    this.selectionPending = false;
    this.disableSelection();
    this.iframe = null;
    this.setState({ mode: 'off', selected: null });
  }

  /** Activate element picker in the preview iframe. */
  enableSelection(): void {
    if (!this.iframe?.contentWindow) return;
    // Reset the ready flag so callers get a fresh Promise for this activation.
    this._selectReady = false;
    this._selectReadyListeners = [];
    this.selectionPending = true;
    if (this.isIframeReady()) {
      this.iframe.contentWindow.postMessage({ type: 'visual-select-start' }, '*');
    }
    this.setState({ ...this.state, mode: 'selecting', selected: null });
  }

  /** Deactivate element picker. */
  disableSelection(): void {
    this.selectionPending = false;
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage({ type: 'visual-select-stop' }, '*');
    }
    this.setState({ mode: 'off', selected: null });
  }

  /** Toggle between off and selecting. */
  toggle(): void {
    if (this.state.mode === 'off') {
      this.enableSelection();
    } else {
      this.disableSelection();
    }
  }

  /**
   * Returns a Promise that resolves once the iframe has posted
   * 'visual-select-ready' (meaning its click-capture handler is live).
   *
   * Resolves immediately if the signal has already arrived.
   * Rejects after `timeoutMs` (default 8 s) if the iframe never responds —
   * this surfaces a broken preview build rather than hanging the test.
   *
   * Intended use: call this AFTER enableSelection() and BEFORE dispatching a
   * synthetic or test click into the iframe, to eliminate the postMessage
   * delivery race.
   */
  waitForSelectReady(timeoutMs = 8_000): Promise<void> {
    if (this._selectReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._selectReadyListeners = this._selectReadyListeners.filter(l => l !== listener);
        reject(new Error(`visual-select-ready not received within ${timeoutMs}ms`));
      }, timeoutMs);
      const listener = () => {
        clearTimeout(timer);
        resolve();
      };
      this._selectReadyListeners.push(listener);
    });
  }

  getState(): VisualEditState {
    return { ...this.state };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(next: VisualEditState): void {
    this.state = next;
    for (const l of this.listeners) l({ ...next });
  }

  /**
   * Build a natural-language edit instruction from the selected element
   * and a user-provided edit description. Ready to send to the AI chat.
   *
   * Identity priority (most → least stable):
   *   data-testid > data-studio-hash > data-figma-id > CSS selector > tag
   *
   * When a stable data attribute is found it is used as the primary locator.
   * When no stable identifier exists and the CSS selector may be fragile
   * (class-based or structural), structural hints (boundedPath, sibling index)
   * are appended as additional context for the AI.
   */
  buildEditPrompt(element: SelectedElement, editDescription: string): string {
    // Prefer stable identity hint over fragile inferred CSS selector
    const STABLE_PRIORITY = ['data-testid', 'data-studio-hash', 'data-figma-id'];
    const stableKey = STABLE_PRIORITY.find(k => element.dataAttributes?.[k]);

    const loc = stableKey
      ? `the element with \`${stableKey}="${element.dataAttributes[stableKey]}"\``
      : element.selector
      ? `the element matching \`${element.selector}\``
      : `the \`<${element.tag}>\` element`;

    const context = element.text
      ? ` (current text: "${element.text.slice(0, 60)}")`
      : '';

    const componentHint = element.componentPath
      ? ` [component: ${element.componentPath}]`
      : '';

    // Structural fallback — only when the primary locator is likely fragile:
    // no stable data-attr AND selector is not id-based (#id is usually stable).
    // Sibling position is only mentioned when the element is non-unique.
    const hasStableId = !!stableKey;
    const hasIdSelector = element.selector?.startsWith('#');
    let structuralHint = '';
    if (!hasStableId && !hasIdSelector && element.boundedPath) {
      const siblingInfo = (element.siblingCount ?? 1) > 1
        ? `, item ${(element.siblingIndex ?? 0) + 1} of ${element.siblingCount}`
        : '';
      structuralHint = ` [path: ${element.boundedPath}${siblingInfo}]`;
    }

    return `[Visual Edit] In ${loc}${context}${componentHint}${structuralHint}: ${editDescription}`;
  }

  /**
   * @internal For Playwright/e2e testing only.
   * Forces the bridge into 'selected' state without requiring a real iframe
   * click — bypasses the iframe origin guard since the selection never comes
   * from the iframe in test scenarios.
   *
   * Only intended to be called from test code (e2e specs or vitest).
   */
  _testForceSelected(element: SelectedElement): void {
    this.setState({ mode: 'selected', selected: element });
  }
}

export const visualEditBridge = new VisualEditBridgeClass();
