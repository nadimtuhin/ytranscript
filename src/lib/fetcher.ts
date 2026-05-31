/**
 * YouTube transcript fetcher
 *
 * Strategy (matches what youtube-transcript, youtube-transcript-api, etc. use):
 * 1. Fetch the YouTube watch page to extract INNERTUBE_API_KEY
 * 2. POST to the innertube /player endpoint with ANDROID client context
 *    — ANDROID client timedtext URLs work server-side without a PO token
 *    — WEB client URLs may require a PO token (&exp=xpe) which needs BotGuard JS
 * 3. Fetch the signed timedtext URL from the innertube response
 */

import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';
import type { FetchOptions, ProxyConfig, Transcript, TranscriptSegment } from '../types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip';

const ANDROID_CLIENT_VERSION = '20.10.38';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const NO_CAPTIONS_ERROR =
  'No captions available for this video. ' +
  'The video may not have captions, may be private, or may be age-restricted.';

const EMPTY_TRANSCRIPT_ERROR =
  'YouTube returned an empty transcript response. ' +
  'Your IP may be rate-limited. Try again later or use --proxy / HTTP_PROXY.';

const PROXY_ENV_VARS = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy'] as const;

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
}

interface TimedTextEvent {
  segs?: Array<{ utf8?: string }>;
  tStartMs?: number;
  dDurationMs?: number;
}

interface TimedTextResponse {
  events?: TimedTextEvent[];
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(input: string): string | null {
  if (VIDEO_ID_RE.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);

    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && VIDEO_ID_RE.test(v)) return v;
    }

    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (VIDEO_ID_RE.test(id)) return id;
    }

    if (url.pathname.startsWith('/embed/')) {
      const id = url.pathname.split('/')[2];
      if (VIDEO_ID_RE.test(id)) return id;
    }
  } catch {
    // Not a valid URL
  }

  return null;
}

function createProxyAgent(proxy?: ProxyConfig): Dispatcher | undefined {
  if (proxy) {
    return new ProxyAgent(proxy.url);
  }

  for (const name of PROXY_ENV_VARS) {
    const value = process.env[name];
    if (value) return new ProxyAgent(value);
  }

  return undefined;
}

/**
 * Run an async operation with a timeout signal. Centralizes the
 * AbortController + setTimeout + clearTimeout dance used by every fetch.
 */
async function withTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract INNERTUBE_API_KEY from the YouTube watch page HTML.
 * This key is required for the innertube API endpoint.
 */
export function extractApiKey(html: string): string | null {
  const match = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Extract captionTracks from ytInitialPlayerResponse embedded in the HTML page.
 * Used as a fallback when the innertube API call fails.
 */
export function extractTracksFromHTML(html: string): CaptionTrack[] | null {
  const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{)/);
  if (!match) return null;

  const start = (match.index ?? 0) + match[0].length - 1;
  let depth = 0;
  let end = start;

  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  try {
    const data = JSON.parse(html.slice(start, end)) as PlayerResponse;
    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return tracks?.length ? tracks : null;
  } catch {
    return null;
  }
}

/**
 * Parse a timedtext json3 response into transcript segments.
 * Pure function — given the parsed JSON, returns segments.
 */
export function parseTimedTextEvents(data: TimedTextResponse): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  for (const event of data.events ?? []) {
    if (!event.segs) continue;

    const text = event.segs
      .map((seg) => seg.utf8 ?? '')
      .join('')
      .trim();

    if (!text) continue;

    segments.push({
      text,
      start: (event.tStartMs ?? 0) / 1000,
      duration: (event.dDurationMs ?? 0) / 1000,
    });
  }

  return segments;
}

/**
 * Select the best caption track based on language preferences.
 * Pure function — returns null when no track is suitable.
 */
export function selectCaptionTrack(
  tracks: CaptionTrack[],
  preferredLanguages: string[],
  includeAutoGenerated: boolean
): CaptionTrack | null {
  if (!tracks.length) return null;

  const manual = tracks.filter((t) => t.kind !== 'asr');
  const auto = tracks.filter((t) => t.kind === 'asr');

  const searchOrder = includeAutoGenerated ? [...manual, ...auto] : manual;

  for (const lang of preferredLanguages) {
    const match = searchOrder.find((t) =>
      t.languageCode.toLowerCase().startsWith(lang.toLowerCase())
    );
    if (match) return match;
  }

  return searchOrder[0] || null;
}

/**
 * Fetch caption tracks using the ANDROID innertube client.
 * ANDROID client timedtext URLs work server-side without a PO token,
 * unlike WEB client URLs which may require botguard/PO token (&exp=xpe).
 */
async function fetchTracksViaAndroid(
  videoId: string,
  apiKey: string,
  timeout: number,
  dispatcher: Dispatcher | undefined
): Promise<CaptionTrack[] | null> {
  try {
    const response = await withTimeout(timeout, (signal) =>
      fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ANDROID_UA,
          'X-YouTube-Client-Name': '3',
          'X-YouTube-Client-Version': ANDROID_CLIENT_VERSION,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: ANDROID_CLIENT_VERSION,
              hl: 'en',
              gl: 'US',
            },
          },
          videoId,
        }),
        signal,
        ...(dispatcher && { dispatcher: dispatcher as unknown as Record<string, unknown> }),
      })
    );

    if (!response.ok) return null;

    const data = (await response.json()) as PlayerResponse;
    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return tracks?.length ? tracks : null;
  } catch {
    return null;
  }
}

/**
 * Fetch caption tracks: fetch the watch page to get the API key,
 * then use the ANDROID innertube client to get working timedtext URLs.
 * Falls back to the HTML-embedded captionTracks.
 */
async function fetchCaptionTracks(
  videoId: string,
  timeout: number,
  proxy?: ProxyConfig
): Promise<CaptionTrack[]> {
  const dispatcher = createProxyAgent(proxy);

  const pageResp = await withTimeout(timeout, (signal) =>
    fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal,
      ...(dispatcher && { dispatcher: dispatcher as unknown as Record<string, unknown> }),
    })
  );

  if (!pageResp.ok) {
    throw new Error(NO_CAPTIONS_ERROR);
  }

  const html = await pageResp.text();
  const apiKey = extractApiKey(html);

  // Primary: ANDROID innertube call — returns server-usable signed URLs
  if (apiKey) {
    const tracks = await fetchTracksViaAndroid(videoId, apiKey, timeout, dispatcher);
    if (tracks) return tracks;
  }

  // Fallback: HTML-embedded captionTracks (may have IP/region restrictions on timedtext fetch)
  const htmlTracks = extractTracksFromHTML(html);
  if (htmlTracks) return htmlTracks;

  throw new Error(NO_CAPTIONS_ERROR);
}

/**
 * Fetch and parse a caption track
 */
async function fetchCaptionTrack(
  url: string,
  timeout: number,
  proxy?: ProxyConfig
): Promise<TranscriptSegment[]> {
  const dispatcher = createProxyAgent(proxy);
  // Strip any existing fmt parameter before adding our own (ANDROID URLs include &fmt=srv3)
  const jsonUrl = `${url.replace(/&fmt=[^&]*/g, '')}&fmt=json3`;

  const response = await withTimeout(timeout, (signal) =>
    fetch(jsonUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://www.youtube.com/',
      },
      signal,
      ...(dispatcher && { dispatcher: dispatcher as unknown as Record<string, unknown> }),
    })
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.text();

  if (!body) {
    throw new Error(EMPTY_TRANSCRIPT_ERROR);
  }

  let data: TimedTextResponse;
  try {
    data = JSON.parse(body) as TimedTextResponse;
  } catch {
    throw new Error('Failed to parse transcript data (unexpected format from YouTube)');
  }

  if (!data || typeof data !== 'object') {
    throw new Error(EMPTY_TRANSCRIPT_ERROR);
  }

  return parseTimedTextEvents(data);
}

/**
 * Fetch available caption tracks for a video
 */
export async function fetchVideoInfo(
  videoId: string,
  options: FetchOptions = {}
): Promise<CaptionTrack[]> {
  const { timeout = 30000, proxy } = options;
  return fetchCaptionTracks(videoId, timeout, proxy);
}

/**
 * Fetch transcript for a single video
 */
export async function fetchTranscript(
  videoId: string,
  options: FetchOptions = {}
): Promise<Transcript> {
  const { languages = ['en'], timeout = 30000, includeAutoGenerated = true, proxy } = options;

  const captionTracks = await fetchCaptionTracks(videoId, timeout, proxy);

  const selectedTrack = selectCaptionTrack(captionTracks, languages, includeAutoGenerated);

  if (!selectedTrack) {
    throw new Error('No suitable caption track found');
  }

  const segments = await fetchCaptionTrack(selectedTrack.baseUrl, timeout, proxy);

  if (!segments.length) {
    throw new Error('Caption track is empty');
  }

  const fullText = segments.map((s) => s.text).join(' ');

  return {
    videoId,
    text: fullText,
    segments,
    language: selectedTrack.languageCode,
    isAutoGenerated: selectedTrack.kind === 'asr',
  };
}
