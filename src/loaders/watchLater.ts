/**
 * Load YouTube watch-later playlist from Google Takeout CSV
 */

import type { WatchHistoryMeta } from '../types';

interface CSVRow {
  [key: string]: string;
}

/**
 * Simple CSV parser for Google Takeout format
 */
function parseCSV(text: string): CSVRow[] {
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
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
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
 * Load watch-later playlist from Google Takeout CSV file
 */
export async function loadWatchLater(
  filePath: string
): Promise<WatchHistoryMeta[]> {
  const file = Bun.file(filePath);
  const text = await file.text();
  const rows = parseCSV(text);

  const results: WatchHistoryMeta[] = [];

  for (const row of rows) {
    // Handle different possible column names
    const videoId = row['Video ID'] || row['video_id'] || row['Video Id'];
    const addedAt =
      row['Playlist Video Creation Timestamp'] ||
      row['added_at'] ||
      row['Added At'];

    if (!videoId) continue;

    results.push({
      videoId,
      watchedAt: addedAt,
      source: 'watch_later',
    });
  }

  return results;
}
