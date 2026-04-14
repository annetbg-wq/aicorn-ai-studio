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

  private messageHandler = (e: MessageEvent) => {
    if (e.data?.type !== 'visual-element-selected') return;
    const payload = e.data.payload as SelectedElement;
    this.setState({ mode: 'selected', selected: payload });
  };

  /** Attach to the preview iframe and start listening. */
  attach(iframe: HTMLIFrameElement): void {
    this.detach();
    this.iframe = iframe;
    window.addEventListener('message', this.messageHandler);
  }

  /** Detach and stop listening. */
  detach(): void {
    if (!this.iframe) return;
    window.removeEventListener('message', this.messageHandler);
    this.disableSelection();
    this.iframe = null;
    this.setState({ mode: 'off', selected: null });
  }

  /** Activate element picker in the preview iframe. */
  enableSelection(): void {
    if (!this.iframe?.contentWindow) return;
    this.iframe.contentWindow.postMessage({ type: 'visual-select-start' }, '*');
    this.setState({ ...this.state, mode: 'selecting', selected: null });
  }

  /** Deactivate element picker. */
  disableSelection(): void {
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
   */
  buildEditPrompt(element: SelectedElement, editDescription: string): string {
    const loc = element.selector
      ? `the element matching \`${element.selector}\``
      : `the \`<${element.tag}>\` element`;
    const context = element.text
      ? ` (current text: "${element.text.slice(0, 60)}")`
      : '';
    return `[Visual Edit] In ${loc}${context}: ${editDescription}`;
  }
}

export const visualEditBridge = new VisualEditBridgeClass();
