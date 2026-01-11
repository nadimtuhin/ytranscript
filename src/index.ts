/**
 * ytranscript - Fast YouTube transcript extraction
 *
 * @example
 * ```typescript
 * import { fetchTranscript, processVideos } from 'ytranscript';
 *
 * // Fetch a single transcript
 * const transcript = await fetchTranscript('dQw4w9WgXcQ');
 * console.log(transcript.text);
 *
 * // Bulk process from Google Takeout
 * import { loadWatchHistory, loadWatchLater, mergeVideoSources } from 'ytranscript';
 *
 * const history = await loadWatchHistory('./watch-history.json');
 * const watchLater = await loadWatchLater('./watch-later.csv');
 * const videos = mergeVideoSources(history, watchLater);
 *
 * const results = await processVideos(videos, {
 *   concurrency: 4,
 *   onProgress: (done, total) => console.log(`${done}/${total}`)
 * });
 * ```
 */

// Core fetcher
export { fetchTranscript, extractVideoId, fetchVideoInfo } from './lib/fetcher';

// Bulk processor
export { processVideos, streamVideos } from './lib/processor';

// Loaders
export {
  loadWatchHistory,
  loadWatchLater,
  fromVideoIds,
  mergeVideoSources,
  loadProcessedIds,
} from './loaders';

// Output formatters
export {
  writeJsonl,
  appendJsonl,
  writeCsv,
  formatSrt,
  formatVtt,
  formatText,
} from './outputs';

// Types
export type {
  ProxyConfig,
  Transcript,
  TranscriptSegment,
  TranscriptResult,
  WatchHistoryMeta,
  FetchOptions,
  BulkOptions,
  OutputFormat,
  OutputOptions,
} from './types';
