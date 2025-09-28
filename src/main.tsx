import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
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

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

// Load PostHog on user interaction (lazy)
loadPosthogOnInteraction();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
