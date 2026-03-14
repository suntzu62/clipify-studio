export function buildFrontendAppUrl(
  frontendUrl: string,
  appPath: string,
  query: Record<string, string | undefined> = {}
): string {
  const url = new URL(frontendUrl);
  const normalizedPath = appPath.startsWith('/') ? appPath : `/${appPath}`;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();
  url.hash = `#${normalizedPath}${queryString ? `?${queryString}` : ''}`;

  return url.toString();
}
