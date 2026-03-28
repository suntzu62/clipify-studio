export function hasPendingHeroIntent(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return Boolean(window.localStorage.getItem('cortai:pendingHeroUrl'));
  } catch {
    return false;
  }
}

export function getPostAuthRedirectPath(fallbackPath: string): string {
  return hasPendingHeroIntent() ? '/' : fallbackPath;
}
