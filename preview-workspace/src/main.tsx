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
  setTimeout(notifyMounted, 500);
  setTimeout(notifyMounted, 1500);
});

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
