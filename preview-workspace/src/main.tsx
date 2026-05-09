import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { BUILD_ID } from './__build_id';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Notify the studio host that this preview build has mounted.
// The studio waits for this postMessage in `waitForIframeMounted` to flip
// the iframe state from "compiling" → "ready". We post twice — once on the
// next animation frame (when the React tree is committed) and once after a
// short delay, in case the host's listener attached late or messages were
// dropped during navigation.
function notifyMounted(): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: 'preview-mounted', buildId: BUILD_ID },
      '*',
    );
  } catch { /* parent may be cross-origin; ignore */ }
}
requestAnimationFrame(() => {
  notifyMounted();
  setTimeout(notifyMounted, 100);
});

// Surface runtime errors to the host so the studio can mark the build as failed
// instead of waiting for the mount timeout.
window.addEventListener('error', (e) => {
  if (window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: 'iframe-error', buildId: BUILD_ID, message: String(e.message ?? e.error ?? 'error') },
      '*',
    );
  } catch { /* ignore */ }
});
window.addEventListener('unhandledrejection', (e) => {
  if (window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: 'iframe-error', buildId: BUILD_ID, message: String(e.reason ?? 'unhandled rejection') },
      '*',
    );
  } catch { /* ignore */ }
});
