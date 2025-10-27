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

// Register service worker for caching
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(() => {
        // Silently fail if service worker registration fails
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
