import {
  extractYouTubeVideoId,
  isSupportedChapterVideoUrl,
  isUploadVideoUrl,
  isYouTubeVideoUrl,
} from './chapter-video-source.util';

describe('chapter-video-source.util', () => {
  const youtubeId = 'dQw4w9WgXcQ';

  it('parses supported YouTube URL formats', () => {
    const urls = [
      `https://www.youtube.com/watch?v=${youtubeId}`,
      `https://youtu.be/${youtubeId}`,
      `https://www.youtube.com/embed/${youtubeId}`,
      `https://www.youtube.com/shorts/${youtubeId}`,
      `https://www.youtube.com/live/${youtubeId}`,
      `https://www.youtube-nocookie.com/embed/${youtubeId}`,
      `youtube.com/watch?v=${youtubeId}`,
    ];

    for (const url of urls) {
      expect(extractYouTubeVideoId(url)).toBe(youtubeId);
      expect(isYouTubeVideoUrl(url)).toBe(true);
      expect(isSupportedChapterVideoUrl(url)).toBe(true);
    }
  });

  it('accepts upload paths and absolute upload URLs', () => {
    const urls = [
      '/uploads/video/chapter-1.mp4',
      'uploads/video/chapter-1.mp4',
      'https://api.chabaqa.io/uploads/video/chapter-1.mp4',
      'http://localhost:3000/uploads/video/chapter-1.mp4',
    ];

    for (const url of urls) {
      expect(isUploadVideoUrl(url)).toBe(true);
      expect(isSupportedChapterVideoUrl(url)).toBe(true);
    }
  });

  it('rejects unsupported hosts and malformed YouTube links', () => {
    const urls = [
      'https://example.com/video.mp4',
      'https://vimeo.com/12345',
      'https://youtube.com/watch?v=short',
      'https://youtube.com/embed/not-a-valid-id',
    ];

    for (const url of urls) {
      expect(isSupportedChapterVideoUrl(url)).toBe(false);
    }
  });
});
