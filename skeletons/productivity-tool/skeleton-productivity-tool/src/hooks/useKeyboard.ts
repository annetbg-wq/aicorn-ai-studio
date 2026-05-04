import { useEffect } from 'react';

interface KeyHandler {
  /** Lowercase key name. Use 'k' for "K", 'arrowup' for ArrowUp, etc. */
  key: string;
  /** Require ⌘ on Mac / Ctrl elsewhere. */
  meta?: boolean;
  /** Require Shift. */
  shift?: boolean;
  handler: (event: KeyboardEvent) => void;
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Attach global keyboard shortcuts. Skips while focus is in an input/textarea
 * unless the user is also holding the meta key.
 */
export function useKeyboard(shortcuts: readonly KeyHandler[]): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      for (const sc of shortcuts) {
        if (event.key.toLowerCase() !== sc.key.toLowerCase()) continue;
        if (sc.shift && !event.shiftKey) continue;
        if (!sc.shift && event.shiftKey) continue;
        const metaPressed = isMac ? event.metaKey : event.ctrlKey;
        if (sc.meta && !metaPressed) continue;
        if (!sc.meta && metaPressed) continue;
        if (inField && !sc.meta) continue;

        event.preventDefault();
        sc.handler(event);
        return;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
