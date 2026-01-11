/**
 * Bulk transcript processor with concurrency control,
 * rate limiting, and resume support
 */

import pLimit from 'p-limit';
import type { BulkOptions, TranscriptResult, WatchHistoryMeta } from '../types';
import { fetchTranscript } from './fetcher';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_PAUSE_AFTER = 10;
const DEFAULT_PAUSE_DURATION = 5000;

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

  // Filter out already-processed videos
  const toProcess = videos.filter((v) => !skipIds.has(v.videoId));

  if (!toProcess.length) {
    return [];
  }

  const limit = pLimit(concurrency);
  const results: TranscriptResult[] = [];
  let completed = 0;

  const processOne = async (meta: WatchHistoryMeta): Promise<TranscriptResult> => {
    try {
      const transcript = await fetchTranscript(meta.videoId, fetchOptions);
      return { meta, transcript };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { meta, transcript: null, error: message };
    }
  };

  // Process in batches for rate limiting
  const batches: WatchHistoryMeta[][] = [];
  for (let i = 0; i < toProcess.length; i += pauseAfter) {
    batches.push(toProcess.slice(i, i + pauseAfter));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    const batchPromises = batch.map((meta) =>
      limit(async () => {
        const result = await processOne(meta);
        completed++;
        onProgress?.(completed, toProcess.length, result);
        return result;
      })
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Pause between batches (except after the last one)
    if (batchIndex < batches.length - 1 && pauseDuration > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseDuration));
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

  const toProcess = videos.filter((v) => !skipIds.has(v.videoId));

  if (!toProcess.length) {
    return;
  }

  const limit = pLimit(concurrency);
  let processedInBatch = 0;

  for (const meta of toProcess) {
    const result = await limit(async () => {
      try {
        const transcript = await fetchTranscript(meta.videoId, fetchOptions);
        return { meta, transcript } as TranscriptResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { meta, transcript: null, error: message } as TranscriptResult;
      }
    });

    yield result;
    processedInBatch++;

    // Rate limiting
    if (processedInBatch >= pauseAfter) {
      processedInBatch = 0;
      if (pauseDuration > 0) {
        await new Promise((resolve) => setTimeout(resolve, pauseDuration));
      }
    }
  }
}
