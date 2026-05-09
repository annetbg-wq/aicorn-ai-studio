import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BUILD_ID } from './__build_id';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Notify the studio iframe host that the preview is mounted.
// ProtoPipeline.compile() waits for this message to mark the preview ready.
try {
  if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    window.parent.postMessage(
      { type: 'preview-mounted', buildId: BUILD_ID },
      '*',
    );
  }
} catch {
  // cross-origin restrictions — ignore, ProtoPipeline has a fallback timeout
}
