#!/usr/bin/env node
/**
 * ytranscript CLI - Bulk YouTube transcript extraction
 */

import { readFile, writeFile } from 'node:fs/promises';
import { program } from 'commander';
import { version } from '../package.json';
import { formatTranscriptForCli, validateProxyUrl } from './cli-helpers';
import {
  appendJsonl,
  extractVideoId,
  fetchTranscript,
  fetchVideoInfo,
  fromVideoIds,
  loadProcessedIds,
  loadWatchHistory,
  loadWatchLater,
  mergeVideoSources,
  streamVideos,
  writeCsv,
} from './index';
import type { ProxyConfig, TranscriptResult, WatchHistoryMeta } from './types';

// ANSI colors
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

/**
 * Parse and validate proxy option (exits on invalid URL).
 */
function parseProxy(proxyUrl: string | undefined): ProxyConfig | undefined {
  if (!proxyUrl) return undefined;
  if (!validateProxyUrl(proxyUrl)) {
    console.error(red(`Invalid proxy URL: ${proxyUrl}`));
    console.error(dim('Expected format: http://[user:pass@]host:port'));
    process.exit(1);
  }
  return { url: proxyUrl };
}

/**
 * Try loading a source, logging failures but never throwing.
 */
async function tryLoadSource(
  label: string,
  path: string,
  load: (p: string) => Promise<WatchHistoryMeta[]>
): Promise<WatchHistoryMeta[] | null> {
  console.log(dim(`Loading ${label} from ${path}...`));
  try {
    const items = await load(path);
    console.log(`  Found ${items.length} videos in ${label}`);
    return items;
  } catch (error) {
    console.error(red(`Failed to load ${label}: ${error}`));
    return null;
  }
}

program
  .name('ytranscript')
  .description('Fast YouTube transcript extraction with bulk processing')
  .version(version);

// Single video command
program
  .command('get <video>')
  .description('Fetch transcript for a single video (ID or URL)')
  .option('-l, --lang <codes>', 'Preferred language codes (comma-separated)', 'en')
  .option('-f, --format <format>', 'Output format: text, json, srt, vtt', 'text')
  .option('-t, --timestamps', 'Include timestamps in text output')
  .option('-o, --output <file>', 'Write to file instead of stdout')
  .option('--proxy <url>', 'HTTP proxy URL (e.g., http://user:pass@host:port)')
  .action(async (video: string, options) => {
    const videoId = extractVideoId(video);
    if (!videoId) {
      console.error(red(`Invalid video ID or URL: ${video}`));
      process.exit(1);
    }

    const proxy = parseProxy(options.proxy);

    try {
      const transcript = await fetchTranscript(videoId, {
        languages: options.lang.split(','),
        proxy,
      });

      const output = formatTranscriptForCli(transcript, options.format, !!options.timestamps);

      if (options.output) {
        await writeFile(options.output, output, 'utf-8');
        console.log(green(`Written to ${options.output}`));
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error(red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// Bulk processing command
program
  .command('bulk')
  .description('Bulk fetch transcripts from Google Takeout or video list')
  .option('--history <file>', 'Path to Google Takeout watch-history.json')
  .option('--watch-later <file>', 'Path to Google Takeout watch-later.csv')
  .option('--videos <ids>', 'Comma-separated video IDs or URLs')
  .option('--file <file>', 'File with video IDs/URLs (one per line)')
  .option('-o, --out-jsonl <file>', 'Output JSONL file', 'transcripts.jsonl')
  .option('--out-csv <file>', 'Also write to CSV file')
  .option('-c, --concurrency <n>', 'Concurrent requests', '4')
  .option('--pause-after <n>', 'Pause after N requests', '10')
  .option('--pause-ms <n>', 'Pause duration in ms', '5000')
  .option('-l, --lang <codes>', 'Preferred languages (comma-separated)', 'en')
  .option('--proxy <url>', 'HTTP proxy URL (e.g., http://user:pass@host:port)')
  .option('--resume', 'Resume from previous run (skip already processed)')
  .action(async (options) => {
    const sources: WatchHistoryMeta[][] = [];

    if (options.history) {
      const items = await tryLoadSource('watch history', options.history, loadWatchHistory);
      if (items) sources.push(items);
    }

    if (options.watchLater) {
      const items = await tryLoadSource('watch-later', options.watchLater, loadWatchLater);
      if (items) sources.push(items);
    }

    if (options.videos) {
      const ids = options.videos.split(',').map((s: string) => s.trim());
      sources.push(fromVideoIds(ids));
      console.log(`  Added ${ids.length} videos from --videos`);
    }

    if (options.file) {
      try {
        const content = await readFile(options.file, 'utf-8');
        const ids = content
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'));
        sources.push(fromVideoIds(ids));
        console.log(`  Added ${ids.length} videos from ${options.file}`);
      } catch (error) {
        console.error(red(`Failed to load file: ${error}`));
      }
    }

    if (!sources.length) {
      console.error(
        red('No input sources provided. Use --history, --watch-later, --videos, or --file')
      );
      process.exit(1);
    }

    // Merge and dedupe
    const allVideos = mergeVideoSources(...sources);
    console.log(`\n${green(String(allVideos.length))} unique videos to process`);

    // Load already processed IDs if resuming
    let skipIds = new Set<string>();
    if (options.resume) {
      skipIds = await loadProcessedIds(options.outJsonl);
      if (skipIds.size > 0) {
        console.log(dim(`Resuming: ${skipIds.size} already processed, skipping...`));
      }
    }

    const toProcess = allVideos.filter((v) => !skipIds.has(v.videoId));
    if (!toProcess.length) {
      console.log(green('All videos already processed!'));
      return;
    }

    console.log(`Processing ${toProcess.length} videos...\\n`);

    let successCount = 0;
    let failCount = 0;
    const csvResults: TranscriptResult[] = [];
    const proxy = parseProxy(options.proxy);

    // Stream results for real-time output
    for await (const result of streamVideos(toProcess, {
      concurrency: Number.parseInt(options.concurrency, 10),
      pauseAfter: Number.parseInt(options.pauseAfter, 10),
      pauseDuration: Number.parseInt(options.pauseMs, 10),
      languages: options.lang.split(','),
      proxy,
    })) {
      const status = result.transcript ? green('OK') : red('FAIL');
      const title = result.meta.title?.slice(0, 50) || result.meta.videoId;
      console.log(`[${result.meta.videoId}] ${status} ${dim(title)}`);

      if (result.transcript) {
        successCount++;
      } else {
        failCount++;
      }

      // Append to JSONL immediately
      await appendJsonl(result, options.outJsonl);

      if (options.outCsv) {
        csvResults.push(result);
      }
    }

    if (options.outCsv && csvResults.length) {
      await writeCsv(csvResults, { path: options.outCsv, append: options.resume });
      console.log(dim(`\nCSV written to ${options.outCsv}`));
    }

    console.log(`\n${green('Done!')} ${successCount} succeeded, ${failCount} failed`);
    console.log(`Output: ${options.outJsonl}`);
  });

// Info command
program
  .command('info <video>')
  .description('Show available transcript languages for a video')
  .option('--proxy <url>', 'HTTP proxy URL (e.g., http://user:pass@host:port)')
  .action(async (video: string, options) => {
    const videoId = extractVideoId(video);
    if (!videoId) {
      console.error(red(`Invalid video ID or URL: ${video}`));
      process.exit(1);
    }

    const proxy = parseProxy(options.proxy);

    try {
      const tracks = await fetchVideoInfo(videoId, { proxy });

      if (!tracks.length) {
        console.log(yellow('No captions available for this video'));
        return;
      }

      console.log(`Available transcripts for ${videoId}:\n`);
      for (const track of tracks) {
        const type = track.kind === 'asr' ? dim('(auto-generated)') : '';
        console.log(`  ${track.languageCode.padEnd(6)} ${track.name?.simpleText || ''} ${type}`);
      }
    } catch (error) {
      console.error(red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

program.parse();
