/**
 * Pure helpers used by the CLI entry point. Extracted so they can be unit
 * tested without booting the `commander` program.
 */

import { formatSrt, formatText, formatVtt } from './outputs';
import type { Transcript } from './types';

const VALID_PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks4:', 'socks5:']);

/**
 * Validate proxy URL format. Pure function.
 */
export function validateProxyUrl(url: string): boolean {
  try {
    return VALID_PROXY_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Format a transcript according to the requested CLI format. Pure function.
 */
export function formatTranscriptForCli(
  transcript: Transcript,
  format: string,
  includeTimestamps: boolean
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(transcript, null, 2);
    case 'srt':
      return formatSrt(transcript);
    case 'vtt':
      return formatVtt(transcript);
    default:
      return formatText(transcript, includeTimestamps);
  }
}
