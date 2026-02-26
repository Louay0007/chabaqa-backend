const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function parseUrlLenient(value: string): URL | null {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    const looksLikeHost =
      /^(?:www\.)?(?:youtu\.be|youtube\.com|m\.youtube\.com|music\.youtube\.com|youtube-nocookie\.com)/i.test(
        value,
      );
    if (!looksLikeHost) return null;

    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

function extractIdFromPath(pathname: string, prefix: string): string | null {
  if (!pathname.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const candidate = pathname.slice(prefix.length).split('/')[0]?.trim();
  return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
}

export function normalizeChapterVideoUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isUploadVideoUrl(value: unknown): boolean {
  const url = normalizeChapterVideoUrl(value);
  if (!url) return false;

  if (/^\/?uploads(?:\/|$)/i.test(url)) {
    return true;
  }

  const parsed = parseUrlLenient(url);
  if (!parsed) return false;

  return /^\/uploads(?:\/|$)/i.test(parsed.pathname || '');
}

export function extractYouTubeVideoId(value: unknown): string | null {
  const url = normalizeChapterVideoUrl(value);
  if (!url) return null;

  if (YOUTUBE_ID_PATTERN.test(url)) {
    return url;
  }

  const parsed = parseUrlLenient(url);
  if (!parsed) return null;

  const host = normalizeHostname(parsed.hostname);
  const pathname = parsed.pathname || '';

  if (host === 'youtu.be') {
    const candidate = pathname.replace(/^\/+/, '').split('/')[0]?.trim();
    return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
  }

  const isYoutubeHost =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com';

  if (!isYoutubeHost) return null;

  if (pathname === '/watch') {
    const candidate = parsed.searchParams.get('v')?.trim() || '';
    return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
  }

  return (
    extractIdFromPath(pathname, '/embed/') ||
    extractIdFromPath(pathname, '/shorts/') ||
    extractIdFromPath(pathname, '/live/') ||
    extractIdFromPath(pathname, '/v/')
  );
}

export function isYouTubeVideoUrl(value: unknown): boolean {
  return Boolean(extractYouTubeVideoId(value));
}

export function isSupportedChapterVideoUrl(value: unknown): boolean {
  return isUploadVideoUrl(value) || isYouTubeVideoUrl(value);
}
