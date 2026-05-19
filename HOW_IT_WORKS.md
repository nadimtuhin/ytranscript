# How ytranscript Works

This document explains the technical internals of how ytranscript
fetches YouTube transcripts.

## Disclaimer

> **Important**: ytranscript uses YouTube's **undocumented internal API**
> (Innertube). This is not an official, supported API. YouTube can change
> or block this at any time without notice. Use at your own risk.
>
> Accessing YouTube's internal APIs may violate their
> [Terms of Service](https://www.youtube.com/t/terms). This tool is intended
> for personal use, research, and educational purposes. Users are responsible
> for ensuring their usage complies with applicable terms and laws.

## Overview

ytranscript fetches video captions using YouTube's internal **Innertube API** -
the same API that powers youtube.com. This is an undocumented API that could
change at any time.

## Known Limitations

Before using ytranscript, be aware of these limitations:

| Scenario | Behavior |
| -------------------------------- | ----------------------------------------- |
| **Age-restricted videos** | Fails (requires authentication) |
| **Private videos** | Fails (requires authentication) |
| **Region-blocked videos** | May fail depending on your IP location |
| **Members-only/Premium content** | Fails (requires authentication) |
| **Live streams** | No captions available during stream |
| **Videos without captions** | Returns "No captions available" error |
| **Deleted videos** | Returns error |
| **Auto-translation tracks** | Not supported (only original captions) |

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        ytranscript                               │
├─────────────────────────────────────────────────────────────────┤
│        CLI        │    Library API    │                         │
├─────────────────────────────────────────────────────────────────┤
│                      Core Fetcher                                │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │ Player API Call │───▶│ Caption Track    │───▶ Transcript     │
│  │ (get track URLs)│    │ Fetch (json3)    │                    │
│  └─────────────────┘    └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 YouTube Innertube API (undocumented)
```

## The Three-Step Process

As of v1.3.0, ytranscript uses the **ANDROID innertube client** instead of the WEB client.
YouTube's WEB client now requires a Proof of Origin Token (POT/BotGuard) for server-side
requests, which requires executing YouTube's obfuscated JavaScript. The ANDROID client
is exempt from this restriction.

### Step 1: Fetch the Watch Page and Extract the API Key

We fetch `https://www.youtube.com/watch?v=VIDEO_ID` with a browser User-Agent and
extract `INNERTUBE_API_KEY` from the embedded `ytcfg.set({...})` JavaScript:

```
"INNERTUBE_API_KEY":"AIzaSy..."
```

This key is passed as a `?key=` query parameter to the innertube endpoint.
As a fallback, `ytInitialPlayerResponse` embedded in the same page contains
caption track URLs that can be used directly if the innertube call fails.

### Step 2: Get Caption Track URLs via ANDROID Client

**Endpoint:** `POST https://www.youtube.com/youtubei/v1/player?key=API_KEY&prettyPrint=false`

**Request:**

```json
{
  "context": {
    "client": {
      "clientName": "ANDROID",
      "clientVersion": "20.10.38",
      "hl": "en",
      "gl": "US"
    }
  },
  "videoId": "VIDEO_ID"
}
```

**Headers:**
```
User-Agent: com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip
X-YouTube-Client-Name: 3
X-YouTube-Client-Version: 20.10.38
```

> **Why ANDROID?** YouTube's WEB client (`clientName: "WEB"`) now enforces a
> Proof of Origin Token (POT/BotGuard) for server-side requests. Obtaining a
> POT requires executing YouTube's obfuscated JavaScript in a real browser
> environment. The ANDROID client is not subject to this restriction, making
> it the standard approach used by all working server-side transcript libraries.

**Response (relevant part):**

```json
{
  "captions": {
    "playerCaptionsTracklistRenderer": {
      "captionTracks": [
        {
          "baseUrl": "https://www.youtube.com/api/timedtext?...",
          "languageCode": "en",
          "kind": "asr",
          "name": { "simpleText": "English (auto-generated)" }
        },
        {
          "baseUrl": "https://www.youtube.com/api/timedtext?...",
          "languageCode": "es",
          "name": { "simpleText": "Spanish" }
        }
      ]
    }
  }
}
```

- `kind: "asr"` indicates auto-generated captions
- Manual captions have no `kind` field

### Step 3: Fetch Caption Track

Using the `baseUrl` from the ANDROID player response, we fetch the actual transcript in JSON format.
ANDROID client URLs already include `&fmt=srv3`; we strip any existing `fmt` param before appending `&fmt=json3`.

**Endpoint:** `GET {baseUrl}&fmt=json3`

**Response:**

```json
{
  "events": [
    {
      "tStartMs": 0,
      "dDurationMs": 5000,
      "segs": [{ "utf8": "Hello " }, { "utf8": "world" }]
    },
    {
      "tStartMs": 5000,
      "dDurationMs": 3000,
      "segs": [{ "utf8": "Welcome to the video" }]
    }
  ]
}
```

We parse this into normalized segments (converting milliseconds to seconds):

```json
[
  { "text": "Hello world", "start": 0, "duration": 5 },
  { "text": "Welcome to the video", "start": 5, "duration": 3 }
]
```

> **Note**: Events without `segs` arrays (timing markers, style events) are
> filtered out. Newline characters within segments are preserved.

## Curl Examples

### Step 1: Extract INNERTUBE_API_KEY from watch page

```bash
API_KEY=$(curl -s 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' \
  | grep -o '"INNERTUBE_API_KEY":"[^"]*"' | cut -d'"' -f4)
echo "API key: $API_KEY"
```

### Step 2: Get Available Caption Tracks (ANDROID client)

```bash
curl -s -X POST \
  "https://www.youtube.com/youtubei/v1/player?key=$API_KEY&prettyPrint=false" \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' \
  -H 'X-YouTube-Client-Name: 3' \
  -H 'X-YouTube-Client-Version: 20.10.38' \
  -d '{
    "context": {
      "client": {
        "clientName": "ANDROID",
        "clientVersion": "20.10.38",
        "hl": "en",
        "gl": "US"
      }
    },
    "videoId": "dQw4w9WgXcQ"
  }' | jq '.captions.playerCaptionsTracklistRenderer.captionTracks'
```

### Step 3: Fetch Transcript (strip existing fmt, add json3)

```bash
# Replace CAPTION_BASE_URL with the baseUrl from the player response
# Strip &fmt=srv3 (present in ANDROID URLs) before adding &fmt=json3
CAPTION_URL="CAPTION_BASE_URL"
curl -s -H 'User-Agent: Mozilla/5.0' \
  "${CAPTION_URL//&fmt=srv3/}&fmt=json3" | jq '.events'
```

### Full one-liner

```bash
VIDEO_ID="dQw4w9WgXcQ"

API_KEY=$(curl -s "https://www.youtube.com/watch?v=$VIDEO_ID" \
  -H 'User-Agent: Mozilla/5.0' \
  | grep -o '"INNERTUBE_API_KEY":"[^"]*"' | cut -d'"' -f4)

CAPTION_URL=$(curl -s -X POST \
  "https://www.youtube.com/youtubei/v1/player?key=$API_KEY&prettyPrint=false" \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' \
  -H 'X-YouTube-Client-Name: 3' \
  -H 'X-YouTube-Client-Version: 20.10.38' \
  -d "{\"context\":{\"client\":{\"clientName\":\"ANDROID\",\"clientVersion\":\"20.10.38\"}},\"videoId\":\"$VIDEO_ID\"}" \
  | jq -r '.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl // empty')

if [ -n "$CAPTION_URL" ]; then
  curl -s -H 'User-Agent: Mozilla/5.0' \
    "${CAPTION_URL//&fmt=srv3/}&fmt=json3" \
    | jq -r '.events[] | select(.segs) | [.segs[].utf8] | join("")'
else
  echo "No captions available"
fi
```

## Language Selection

ytranscript selects caption tracks using this priority:

1. **Preferred languages** - checked in order specified
2. **Manual over auto-generated** - for each language, manual captions are
   preferred over auto-generated (`kind: "asr"`)
3. **First available** - if no preferred language matches, returns the first
   track in the API response

**Example behavior:**

```typescript
fetchTranscript('VIDEO_ID', { languages: ['es', 'en'] });
```

| Available Tracks | Selected | Explanation |
| ---------------------------------- | ---------------- | ------------------------------------ |
| Spanish (manual), English (manual) | Spanish (manual) | First preferred language found |
| Spanish (auto), English (manual) | Spanish (auto) | Spanish found first (auto is OK) |
| English (manual), English (auto) | English (manual) | Manual preferred over auto for same language |
| French (manual) only | French (manual) | Fallback to first available |

> **Note**: The "manual over auto" preference applies when comparing tracks
> of the same language. If your first preferred language only has auto-generated
> captions, it will be selected over a manual track in your second preferred language.

**Language code matching**: Codes are matched with `startsWith()`, so `en`
matches `en`, `en-US`, `en-GB`, etc.

## Output Formats

| Format     | Description                                 |
| ---------- | ------------------------------------------- |
| `text`     | Plain text, segments joined with spaces     |
| `segments` | JSON array with `{ text, start, duration }` |
| `srt`      | SubRip subtitle format                      |
| `vtt`      | WebVTT subtitle format                      |

## Rate Limiting

YouTube will rate-limit or block IPs making too many requests. The bulk
processor includes built-in throttling:

- `pauseAfter`: Pause after N requests (default: 10)
- `pauseDuration`: Pause duration in ms (default: 5000)
- `concurrency`: Max parallel requests (default: 4)

**What happens when rate-limited:**

- Individual requests may fail with HTTP 429 errors
- The library does not automatically retry rate-limited requests
- Continued requests may result in temporary IP blocks

**Recommendations:**

- Use conservative concurrency settings (2-4)
- Add longer pauses for large batch jobs
- Consider using proxies for bulk operations

## Browser Compatibility

**ytranscript does NOT work in browsers** due to CORS restrictions.

YouTube's API does not include `Access-Control-Allow-Origin` headers,
so browsers block cross-origin requests.

### Workarounds

| Solution                | Description                            |
| ----------------------- | -------------------------------------- |
| **Proxy Server**        | Route requests through your backend    |
| **Serverless Function** | Use Vercel/Netlify/AWS Lambda as proxy |
| **Browser Extension**   | Content scripts can bypass CORS        |
| **Node.js Only**        | Use CLI or library server-side         |

> **Note on extensions**: Manifest V3 extensions have their own fetch
> restrictions. Content scripts injected into youtube.com pages can make
> same-origin requests, but background service workers cannot.

### Example Proxy (Express)

```typescript
import express from 'express';
import { fetchTranscript } from '@nadimtuhin/ytranscript';

const app = express();

// Simple video ID validation (11 alphanumeric chars, dashes, underscores)
const isValidVideoId = (id: string): boolean => /^[a-zA-Z0-9_-]{11}$/.test(id);

app.get('/api/transcript/:videoId', async (req, res) => {
  const { videoId } = req.params;

  // Validate input to prevent abuse
  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID format' });
  }

  try {
    const transcript = await fetchTranscript(videoId);
    res.json(transcript);
  } catch (error) {
    // Don't expose internal error details to clients
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNotFound = message.includes('No captions');
    res.status(isNotFound ? 404 : 500).json({
      error: isNotFound ? 'No captions available' : 'Failed to fetch transcript'
    });
  }
});

app.listen(3000);
```

**Production considerations:**

- Add rate limiting (e.g., `express-rate-limit`)
- Add caching to reduce YouTube API calls
- Add request logging for debugging
- Consider authentication if exposing publicly

Then from browser:

```javascript
const response = await fetch('/api/transcript/dQw4w9WgXcQ');
const transcript = await response.json();
```

## Error Handling

| Error                             | Cause                                  |
| --------------------------------- | -------------------------------------- |
| `No captions available`           | Video has no captions/subtitles        |
| `No suitable caption track found` | Requested language not available       |
| `Caption track is empty`          | Track exists but has no content        |
| `HTTP 429`                        | Rate limited by YouTube                |
| `HTTP 403`                        | Video is private/age-restricted        |
| `AbortError`                      | Request timed out                      |

All errors are thrown as standard JavaScript `Error` objects. Check the
`message` property to determine the error type.

## Technical Notes

- **ANDROID client exempt from POT**: YouTube's WEB client now requires a Proof of Origin Token (BotGuard) for server-side calls. The ANDROID client (`clientName: "ANDROID"`) is not subject to this restriction — this is the approach used by all working server-side transcript libraries as of 2025.
- **INNERTUBE_API_KEY**: Must be extracted from the watch page HTML (`ytcfg.set({...})`). Passed as `?key=` on the innertube endpoint. Fallback: `ytInitialPlayerResponse` embedded in the same page contains caption URLs but they may be IP-restricted.
- **fmt=srv3 stripping**: ANDROID client timedtext URLs already contain `&fmt=srv3`. Always strip existing `fmt` params before appending `&fmt=json3`, otherwise the server uses the first param and returns XML.
- **User-Agent**: Watch page requires a browser UA. Innertube call requires the ANDROID app UA (`com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip`).
- **JSON3 Format**: The `fmt=json3` parameter returns structured JSON. Without it, you get XML/TTML format.
- **Timeout**: Default 30 seconds per request, configurable via options.
- **API Stability**: This is an undocumented API. Expect breaking changes. Check for library updates if the tool stops working.
