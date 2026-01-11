/**
 * Load YouTube watch history from Google Takeout JSON
 */

import type { WatchHistoryMeta } from '../types';

interface TakeoutHistoryItem {
  header?: string;
  title?: string;
  titleUrl?: string;
  subtitles?: Array<{ name?: string; url?: string }>;
  time?: string;
}

/**
 * Extract video ID from YouTube URL
 */
function extractVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1);
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Load watch history from Google Takeout JSON file
 */
export async function loadWatchHistory(filePath: string): Promise<WatchHistoryMeta[]> {
  const file = Bun.file(filePath);
  const text = await file.text();
  const data: TakeoutHistoryItem[] = JSON.parse(text);

  const results: WatchHistoryMeta[] = [];

  for (const item of data) {
    const url = item.titleUrl;
    if (!url) continue;

    const videoId = extractVideoIdFromUrl(url);
    if (!videoId) continue;

    const channel = item.subtitles?.[0];

    results.push({
      videoId,
      title: item.title,
      url,
      channel: channel ? { name: channel.name, url: channel.url } : undefined,
      watchedAt: item.time,
      source: 'history',
    });
  }

  return results;
}
