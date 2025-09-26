export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    // Normalize hostname (remove www.)
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      return id && id.length >= 10 ? id : null;
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      return id && id.length >= 10 ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export function normalizeYoutubeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.replace('/', '');
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (host.endsWith('youtube.com') && url.pathname.startsWith('/shorts/')) {
      const id = url.pathname.split('/')[2];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

