/**
 * Bulk transcript processor with concurrency control,
 * rate limiting, and resume support
 */

import pLimit from 'p-limit';
import type { BulkOptions, FetchOptions, TranscriptResult, WatchHistoryMeta } from '../types';
import { fetchTranscript } from './fetcher';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_PAUSE_AFTER = 10;
const DEFAULT_PAUSE_DURATION = 5000;

/**
 * Split an array into fixed-size chunks. Pure function.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Filter videos that have not already been processed. Pure function.
 */
export function selectUnprocessed(
  videos: WatchHistoryMeta[],
  skipIds: Set<string>
): WatchHistoryMeta[] {
  if (!skipIds.size) return videos;
  return videos.filter((v) => !skipIds.has(v.videoId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a single transcript and wrap failures into a TranscriptResult.
 */
async function fetchResult(
  meta: WatchHistoryMeta,
  fetchOptions: FetchOptions
): Promise<TranscriptResult> {
  try {
    const transcript = await fetchTranscript(meta.videoId, fetchOptions);
    return { meta, transcript };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { meta, transcript: null, error: message };
  }
}

/**
 * Process multiple videos in bulk with concurrency control
 */
export async function processVideos(
  videos: WatchHistoryMeta[],
  options: BulkOptions = {}
): Promise<TranscriptResult[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    pauseAfter = DEFAULT_PAUSE_AFTER,
    pauseDuration = DEFAULT_PAUSE_DURATION,
    skipIds = new Set(),
    onProgress,
    ...fetchOptions
  } = options;

  const toProcess = selectUnprocessed(videos, skipIds);
  if (!toProcess.length) return [];

  const limit = pLimit(concurrency);
  const results: TranscriptResult[] = [];
  let completed = 0;

  const batches = chunk(toProcess, pauseAfter);

  for (let i = 0; i < batches.length; i++) {
    const batchResults = await Promise.all(
      batches[i].map((meta) =>
        limit(async () => {
          const result = await fetchResult(meta, fetchOptions);
          completed++;
          onProgress?.(completed, toProcess.length, result);
          return result;
        })
      )
    );
    results.push(...batchResults);

    // Pause between batches (except after the last one)
    if (i < batches.length - 1 && pauseDuration > 0) {
      await sleep(pauseDuration);
    }
  }

  return results;
}

/**
 * Create a streaming processor that yields results as they complete
 */
export async function* streamVideos(
  videos: WatchHistoryMeta[],
  options: BulkOptions = {}
): AsyncGenerator<TranscriptResult> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    pauseAfter = DEFAULT_PAUSE_AFTER,
    pauseDuration = DEFAULT_PAUSE_DURATION,
    skipIds = new Set(),
    ...fetchOptions
  } = options;

  const toProcess = selectUnprocessed(videos, skipIds);
  if (!toProcess.length) return;

  const limit = pLimit(concurrency);
  let processedInBatch = 0;

  for (const meta of toProcess) {
    const result = await limit(() => fetchResult(meta, fetchOptions));
    yield result;
    processedInBatch++;

    // Rate limiting
    if (processedInBatch >= pauseAfter) {
      processedInBatch = 0;
      if (pauseDuration > 0) await sleep(pauseDuration);
    }
  }
}
