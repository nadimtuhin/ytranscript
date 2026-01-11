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

## The Two-Step Process

### Step 1: Get Caption Track URLs

First, we call YouTube's player API to get video metadata,
including available caption tracks:

**Endpoint:** `POST https://www.youtube.com/youtubei/v1/player`

**Request:**

```json
{
  "context": {
    "client": {
      "clientName": "WEB",
      "clientVersion": "2.20240101.00.00"
    }
  },
  "videoId": "VIDEO_ID"
}
```

> **Note**: The `clientVersion` format is `YYYY.MM.DD.revision`. YouTube may
> start requiring recent versions in the future, which would break this library.

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

### Step 2: Fetch Caption Track

Using the `baseUrl` from step 1, we fetch the actual transcript in JSON format:

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

### Get Available Caption Tracks

```bash
curl -X POST 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0' \
  -d '{
    "context": {
      "client": {
        "clientName": "WEB",
        "clientVersion": "2.20240101.00.00"
      }
    },
    "videoId": "dQw4w9WgXcQ"
  }' | jq '.captions.playerCaptionsTracklistRenderer.captionTracks'
```

### Fetch Transcript (using baseUrl from above)

```bash
# Replace CAPTION_BASE_URL with the baseUrl from the player response
# User-Agent header is required
curl -H 'User-Agent: Mozilla/5.0' \
  "CAPTION_BASE_URL&fmt=json3" | jq '.events'
```

### One-liner with jq

```bash
# Get the first caption track URL and fetch transcript
VIDEO_ID="dQw4w9WgXcQ"

# Get caption URL (will be empty if no captions available)
CAPTION_URL=$(curl -s -X POST \
  'https://www.youtube.com/youtubei/v1/player?prettyPrint=false' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0' \
  -d "{
    \"context\":{
      \"client\":{
        \"clientName\":\"WEB\",
        \"clientVersion\":\"2.20240101.00.00\"
      }
    },
    \"videoId\":\"$VIDEO_ID\"
  }" \
  | jq -r '.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl // empty')

# Check if URL exists before fetching
if [ -n "$CAPTION_URL" ]; then
  curl -s -H 'User-Agent: Mozilla/5.0' "$CAPTION_URL&fmt=json3" \
    | jq -r '.events[] | select(.segs) | [.segs[].utf8] | join("")'
else
  echo "No captions available for this video"
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

- **User-Agent**: Required for all requests. YouTube may reject requests
  without a browser-like User-Agent header.
- **Client Version**: The `clientVersion` doesn't need to be current today,
  but YouTube could enforce version validation in the future.
- **JSON3 Format**: The `fmt=json3` parameter returns structured JSON.
  Without it, you get XML/TTML format.
- **Timeout**: Default 30 seconds per request, configurable via options.
- **API Stability**: This is an undocumented API. Expect breaking changes.
  Check for library updates if the tool stops working.
