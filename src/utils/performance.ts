// Performance utilities for optimization

export function preloadCriticalResources() {
  // Resource hints are handled in addResourceHints()
  // Removed invalid font preload implementation
}

export function deferNonCriticalScripts() {
  // Defer non-critical JavaScript
  const scripts = document.querySelectorAll('script[data-defer]');
  scripts.forEach(script => {
    if (script instanceof HTMLScriptElement) {
      script.defer = true;
    }
  });
}

// Resource hints for better performance
export function addResourceHints() {
  const hints = [
    { rel: 'dns-prefetch', href: '//fonts.googleapis.com' },
    { rel: 'dns-prefetch', href: '//api.clerk.dev' },
    { rel: 'preconnect', href: 'https://api.clerk.dev' },
  ];

  hints.forEach(hint => {
    const link = document.createElement('link');
    link.rel = hint.rel;
    link.href = hint.href;
    if (hint.rel === 'preconnect') {
      link.crossOrigin = 'anonymous';
    }
    document.head.appendChild(link);
  });
}

// Optimize images for different screen sizes
export function getOptimizedImageSrc(src: string, width: number, quality = 80): string {
  // For now, return the original src
  // In production, you might use a service like Cloudinary or similar
  return src;
}

// Intersection Observer for lazy loading
export function createIntersectionObserver(
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
) {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  return new IntersectionObserver(callback, {
    rootMargin: '50px',
    threshold: 0.1,
    ...options,
  });
}