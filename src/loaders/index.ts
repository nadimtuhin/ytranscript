/**
 * Unified loader for various input sources
 */

import { extractVideoId } from '../lib/fetcher';
import { loadWatchHistory } from './history';
import { loadWatchLater } from './watchLater';
import type { WatchHistoryMeta } from '../types';

export { loadWatchHistory } from './history';
export { loadWatchLater } from './watchLater';

/**
 * Create metadata entries from video IDs or URLs
 */
export function fromVideoIds(
  inputs: string[]
): WatchHistoryMeta[] {
  const results: WatchHistoryMeta[] = [];

  for (const input of inputs) {
    const videoId = extractVideoId(input);
    if (!videoId) continue;

    results.push({
      videoId,
      url: input.startsWith('http')
        ? input
        : `https://www.youtube.com/watch?v=${videoId}`,
      source: 'manual',
    });
  }

  return results;
}

/**
 * Merge multiple sources, deduplicating by video ID
 * Priority: history > watch_later > manual
 */
export function mergeVideoSources(
  ...sources: WatchHistoryMeta[][]
): WatchHistoryMeta[] {
  const seen = new Map<string, WatchHistoryMeta>();

  for (const source of sources) {
    for (const meta of source) {
      if (!seen.has(meta.videoId)) {
        seen.set(meta.videoId, meta);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Load processed video IDs from an existing JSONL file
 */
export async function loadProcessedIds(
  jsonlPath: string
): Promise<Set<string>> {
  const ids = new Set<string>();

  try {
    const file = Bun.file(jsonlPath);
    if (!(await file.exists())) {
      return ids;
    }

    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.meta?.videoId) {
          ids.add(record.meta.videoId);
        } else if (record.videoId) {
          ids.add(record.videoId);
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File doesn't exist or isn't readable
  }

  return ids;
}
