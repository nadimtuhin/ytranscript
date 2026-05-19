/**
 * Unified loader for various input sources
 */

import { extractVideoId } from '../lib/fetcher';
import { fileExists, readTextFile } from '../lib/fs';
import type { WatchHistoryMeta } from '../types';

export { loadWatchHistory } from './history';
export { loadWatchLater } from './watchLater';

/**
 * Create metadata entries from video IDs or URLs
 */
export function fromVideoIds(inputs: string[]): WatchHistoryMeta[] {
  const results: WatchHistoryMeta[] = [];

  for (const input of inputs) {
    const videoId = extractVideoId(input);
    if (!videoId) continue;

    results.push({
      videoId,
      url: input.startsWith('http') ? input : `https://www.youtube.com/watch?v=${videoId}`,
      source: 'manual',
    });
  }

  return results;
}

/**
 * Merge multiple sources, deduplicating by video ID.
 * The first source containing a given ID wins. Pure function.
 */
export function mergeVideoSources(...sources: WatchHistoryMeta[][]): WatchHistoryMeta[] {
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
 * Extract a video ID from a single JSONL record. Returns null when the record
 * does not match a known shape or fails to parse. Pure function.
 *
 * Accepts both `{ meta: { videoId } }` (TranscriptResult shape) and the bare
 * `{ videoId }` legacy shape.
 */
export function extractIdFromJsonlRecord(line: string): string | null {
  try {
    const record = JSON.parse(line);
    if (record?.meta?.videoId) return record.meta.videoId;
    if (record?.videoId) return record.videoId;
  } catch {
    // Skip malformed lines
  }
  return null;
}

/**
 * Load processed video IDs from an existing JSONL file
 */
export async function loadProcessedIds(jsonlPath: string): Promise<Set<string>> {
  const ids = new Set<string>();

  try {
    if (!(await fileExists(jsonlPath))) return ids;

    const text = await readTextFile(jsonlPath);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const id = extractIdFromJsonlRecord(line);
      if (id) ids.add(id);
    }
  } catch {
    // File doesn't exist or isn't readable
  }

  return ids;
}
