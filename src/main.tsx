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
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
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
