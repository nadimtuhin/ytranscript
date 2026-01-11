/**
 * Tests for loaders (history, watchLater, utilities)
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { loadWatchHistory } from '../src/loaders/history';
import { loadWatchLater } from '../src/loaders/watchLater';
import { fromVideoIds, mergeVideoSources, loadProcessedIds } from '../src/loaders';
import { unlink } from 'node:fs/promises';

const TEST_HISTORY_PATH = './tests/fixtures/watch-history.json';
const TEST_WATCH_LATER_PATH = './tests/fixtures/watch-later.csv';
const TEST_JSONL_PATH = './tests/fixtures/processed.jsonl';

beforeAll(async () => {
  // Create test fixtures directory
  await Bun.write('./tests/fixtures/.gitkeep', '');

  // Create mock watch history JSON
  const historyData = [
    {
      header: 'YouTube',
      title: 'Test Video 1',
      titleUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      subtitles: [{ name: 'Test Channel', url: 'https://www.youtube.com/channel/123' }],
      time: '2024-01-15T10:30:00.000Z',
    },
    {
      header: 'YouTube',
      title: 'Test Video 2',
      titleUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      subtitles: [{ name: 'Another Channel' }],
      time: '2024-01-14T08:00:00.000Z',
    },
    {
      // Entry without titleUrl (should be skipped)
      header: 'YouTube',
      title: 'Orphan Entry',
    },
    {
      // Entry with invalid URL (should be skipped)
      header: 'YouTube',
      title: 'Invalid URL',
      titleUrl: 'https://example.com/not-youtube',
    },
  ];
  await Bun.write(TEST_HISTORY_PATH, JSON.stringify(historyData));

  // Create mock watch-later CSV
  const csvData = `Video ID,Playlist Video Creation Timestamp
9bZkp7q19f0,2024-01-10T12:00:00Z
abc123xyz99,2024-01-09T09:00:00Z
`;
  await Bun.write(TEST_WATCH_LATER_PATH, csvData);

  // Create mock processed JSONL
  const jsonlData = [
    { meta: { videoId: 'processed01' }, transcript: { text: 'test' } },
    { meta: { videoId: 'processed02' }, transcript: null, error: 'No captions' },
    { videoId: 'processed03' }, // Alternative format
  ];
  await Bun.write(TEST_JSONL_PATH, jsonlData.map((r) => JSON.stringify(r)).join('\n'));
});

afterAll(async () => {
  // Cleanup test fixtures
  try {
    await unlink(TEST_HISTORY_PATH);
    await unlink(TEST_WATCH_LATER_PATH);
    await unlink(TEST_JSONL_PATH);
    await unlink('./tests/fixtures/.gitkeep');
  } catch {
    // Ignore cleanup errors
  }
});

describe('loadWatchHistory', () => {
  test('loads valid entries from watch history JSON', async () => {
    const results = await loadWatchHistory(TEST_HISTORY_PATH);

    expect(results).toHaveLength(2);
    expect(results[0].videoId).toBe('dQw4w9WgXcQ');
    expect(results[0].title).toBe('Test Video 1');
    expect(results[0].source).toBe('history');
    expect(results[0].channel?.name).toBe('Test Channel');
  });

  test('extracts video IDs correctly', async () => {
    const results = await loadWatchHistory(TEST_HISTORY_PATH);

    expect(results[0].videoId).toBe('dQw4w9WgXcQ');
    expect(results[1].videoId).toBe('jNQXAC9IVRw');
  });

  test('includes watchedAt timestamp', async () => {
    const results = await loadWatchHistory(TEST_HISTORY_PATH);

    expect(results[0].watchedAt).toBe('2024-01-15T10:30:00.000Z');
  });

  test('throws on non-existent file', async () => {
    await expect(loadWatchHistory('./nonexistent.json')).rejects.toThrow();
  });

  test('throws on invalid JSON', async () => {
    await Bun.write('./tests/fixtures/invalid.json', 'not valid json');
    await expect(loadWatchHistory('./tests/fixtures/invalid.json')).rejects.toThrow();
    await unlink('./tests/fixtures/invalid.json');
  });
});

describe('loadWatchLater', () => {
  test('loads valid entries from CSV', async () => {
    const results = await loadWatchLater(TEST_WATCH_LATER_PATH);

    expect(results).toHaveLength(2);
    expect(results[0].videoId).toBe('9bZkp7q19f0');
    expect(results[0].source).toBe('watch_later');
  });

  test('includes added timestamp', async () => {
    const results = await loadWatchLater(TEST_WATCH_LATER_PATH);

    expect(results[0].watchedAt).toBe('2024-01-10T12:00:00Z');
  });

  test('handles alternative column names', async () => {
    const altCsv = `video_id,added_at
testid12345,2024-01-01T00:00:00Z
`;
    await Bun.write('./tests/fixtures/alt-csv.csv', altCsv);
    const results = await loadWatchLater('./tests/fixtures/alt-csv.csv');

    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe('testid12345');
    await unlink('./tests/fixtures/alt-csv.csv');
  });

  test('handles quoted CSV values', async () => {
    const quotedCsv = `Video ID,Playlist Video Creation Timestamp
"quoted123","2024-01-01T00:00:00Z"
`;
    await Bun.write('./tests/fixtures/quoted.csv', quotedCsv);
    const results = await loadWatchLater('./tests/fixtures/quoted.csv');

    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe('quoted123');
    await unlink('./tests/fixtures/quoted.csv');
  });
});

describe('fromVideoIds', () => {
  test('creates metadata from video IDs', () => {
    const results = fromVideoIds(['dQw4w9WgXcQ', 'jNQXAC9IVRw']);

    expect(results).toHaveLength(2);
    expect(results[0].videoId).toBe('dQw4w9WgXcQ');
    expect(results[0].source).toBe('manual');
    expect(results[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  test('extracts IDs from URLs', () => {
    const results = fromVideoIds([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/jNQXAC9IVRw',
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].videoId).toBe('dQw4w9WgXcQ');
    expect(results[1].videoId).toBe('jNQXAC9IVRw');
  });

  test('skips invalid inputs', () => {
    const results = fromVideoIds(['invalid', 'dQw4w9WgXcQ', '']);

    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe('dQw4w9WgXcQ');
  });

  test('preserves original URL for URL inputs', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=100';
    const results = fromVideoIds([url]);

    expect(results[0].url).toBe(url);
  });
});

describe('mergeVideoSources', () => {
  test('merges multiple sources', () => {
    const source1 = [{ videoId: 'vid1', source: 'history' as const }];
    const source2 = [{ videoId: 'vid2', source: 'watch_later' as const }];

    const merged = mergeVideoSources(source1, source2);

    expect(merged).toHaveLength(2);
  });

  test('deduplicates by video ID', () => {
    const source1 = [{ videoId: 'vid1', source: 'history' as const, title: 'First' }];
    const source2 = [{ videoId: 'vid1', source: 'watch_later' as const, title: 'Second' }];

    const merged = mergeVideoSources(source1, source2);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('First'); // First source wins
  });

  test('handles empty sources', () => {
    const merged = mergeVideoSources([], [], []);
    expect(merged).toHaveLength(0);
  });
});

describe('loadProcessedIds', () => {
  test('loads video IDs from JSONL', async () => {
    const ids = await loadProcessedIds(TEST_JSONL_PATH);

    expect(ids.size).toBe(3);
    expect(ids.has('processed01')).toBe(true);
    expect(ids.has('processed02')).toBe(true);
    expect(ids.has('processed03')).toBe(true);
  });

  test('returns empty set for non-existent file', async () => {
    const ids = await loadProcessedIds('./nonexistent.jsonl');
    expect(ids.size).toBe(0);
  });

  test('handles malformed JSON lines', async () => {
    await Bun.write('./tests/fixtures/malformed.jsonl', '{"meta":{"videoId":"good1"}}\nnot json\n{"meta":{"videoId":"good2"}}');
    const ids = await loadProcessedIds('./tests/fixtures/malformed.jsonl');

    expect(ids.has('good1')).toBe(true);
    expect(ids.has('good2')).toBe(true);
    await unlink('./tests/fixtures/malformed.jsonl');
  });
});
