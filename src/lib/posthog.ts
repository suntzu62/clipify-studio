let posthogLoaded = false;

export async function initPosthog() {
  if (posthogLoaded) return;
  
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;
  
  // Lazy load PostHog only when needed
  const { default: posthog } = await import('posthog-js');
  
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
    capture_pageview: true,
    loaded: () => {
      posthogLoaded = true;
    },
  });
}

export function loadPosthogOnInteraction() {
  // Load PostHog on first user interaction
  const loadOnInteraction = () => {
    initPosthog();
    document.removeEventListener('click', loadOnInteraction);
    document.removeEventListener('scroll', loadOnInteraction);
    document.removeEventListener('keydown', loadOnInteraction);
  };
  
  document.addEventListener('click', loadOnInteraction, { once: true });
  document.addEventListener('scroll', loadOnInteraction, { once: true });
  document.addEventListener('keydown', loadOnInteraction, { once: true });
}

