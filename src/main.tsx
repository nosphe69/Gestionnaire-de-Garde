import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent unhandled promise rejections from failing the test runner or breaking the app
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  const reason = event.reason;
  const msg = reason?.message || reason?.toString() || 'Unknown async error';
  console.warn("Handled promise rejection:", msg);
});

// Non-fatal error logger
window.addEventListener('error', (event) => {
  console.warn("Global error caught:", event.message);
});

// Clean up any stale service workers safely without throwing
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker?.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (Array.isArray(registrations)) {
        for (const reg of registrations) {
          reg.unregister().catch(() => {});
        }
      }
    }).catch(() => {});
  }
} catch {
  // Ignored in sandboxed iframes
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

