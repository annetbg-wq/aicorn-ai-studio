import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Sync studio state → html attributes so preview CSS variables and device hints apply.
// S1: 'preview-device' sets html[data-device] (desktop | iphone | pixel | ipad).
// Future: a useDeviceMode() helper can read document.documentElement.dataset.device
// or subscribe to a lightweight CustomEvent dispatched here.
window.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'studio-theme') {
    const t = e.data.theme as string | undefined;
    document.documentElement.classList.toggle('dark', t === 'dark');
    if (t) document.documentElement.setAttribute('data-theme', t);
  }
  if (e.data?.type === 'preview-device') {
    const d = e.data.device as string | undefined;
    if (d) document.documentElement.setAttribute('data-device', d);
  }
});

function Root() {
  useEffect(() => {
    window.parent.postMessage({ type: 'iframe-ready' }, '*');
  }, []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)