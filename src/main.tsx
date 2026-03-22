import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/contexts/AuthContext';
import App from './App.tsx';
import './critical.css';
import { loadPosthogOnInteraction } from './lib/posthog';
import { preloadCriticalResources, addResourceHints } from './utils/performance';

// Load non-critical CSS after initial render
import('./index.css');

// Initialize performance optimizations
preloadCriticalResources();
addResourceHints();

// Disable legacy service worker cache to avoid stale/broken assets in production
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    Promise.all([
      navigator.serviceWorker.getRegistrations(),
      'caches' in window ? window.caches.keys() : Promise.resolve([] as string[]),
    ])
      .then(([registrations, cacheKeys]) => {
        registrations.forEach((registration) => registration.unregister());
        cacheKeys.forEach((cacheKey) => window.caches.delete(cacheKey));
      })
      .then(() => {
        const shouldReload =
          !!navigator.serviceWorker.controller &&
          typeof window.sessionStorage !== 'undefined' &&
          !window.sessionStorage.getItem('cortai-sw-cache-cleared');

        if (shouldReload) {
          window.sessionStorage.setItem('cortai-sw-cache-cleared', '1');
          window.location.reload();
        }
      })
      .catch(() => {
        // Ignore cleanup failures
      });
  });
}

// Load PostHog on user interaction (lazy)
loadPosthogOnInteraction();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
