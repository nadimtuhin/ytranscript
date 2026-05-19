/**
 * Load YouTube watch-later playlist from Google Takeout CSV
 */

import { readTextFile } from '../lib/fs';
import type { WatchHistoryMeta } from '../types';

type CSVRow = Record<string, string>;

const VIDEO_ID_COLUMNS = ['Video ID', 'video_id', 'Video Id'] as const;
const ADDED_AT_COLUMNS = [
  'Playlist Video Creation Timestamp',
  'added_at',
  'Added At',
] as const;

/**
 * Parse a single CSV line handling quoted values (with "" escapes).
 * Pure function.
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Simple CSV parser for Google Takeout format. Pure function.
 */
export function parseCSV(text: string): CSVRow[] {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVRow = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Return the first non-empty value from a row across the given column names.
 */
function pickColumn(row: CSVRow, columns: readonly string[]): string | undefined {
  for (const col of columns) {
    if (row[col]) return row[col];
  }
  return undefined;
}

/**
 * Load watch-later playlist from Google Takeout CSV file
 */
export async function loadWatchLater(filePath: string): Promise<WatchHistoryMeta[]> {
  const text = await readTextFile(filePath);
  const rows = parseCSV(text);

  const results: WatchHistoryMeta[] = [];

  for (const row of rows) {
    const videoId = pickColumn(row, VIDEO_ID_COLUMNS);
    if (!videoId) continue;

    results.push({
      videoId,
      watchedAt: pickColumn(row, ADDED_AT_COLUMNS),
      source: 'watch_later',
    });
  }

  return results;
}
