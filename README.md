# Facebook Public Reshare Time Scraper

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-orange.svg)](https://apify.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-yellow.svg)](https://vitest.dev)

A production-grade Apify Actor designed to extract **exact chronological share timestamps** (second-precision Unix timestamps) and public sharer profiles from Facebook public posts without requiring Facebook credentials or login cookies.

---

## Key Features

- **Exact Timestamps**: Directly intercepts Facebook's internal Relay GraphQL responses to extract canonical Unix seconds (`edge.node.creation_time`).
- **No Relative Date Estimation**: Never relies on fuzzy DOM strings like `"2d"` or `"23 July"`.
- **100% Logged-Out Architecture**: Runs in unauthenticated clean browser contexts (`__user = 0`). Immune to account bans, session checkpointing, or cookie rotation overhead.
- **Outer vs Attached Story Disambiguation**: Specifically isolates the outer reshare timestamp and never accidentally returns the original post's timestamp.
- **Resilient Deduplication**: Multi-tier deduplication based on `shareStoryId`, `sharePostId`, `shareUrl`, or composite fallback keys.
- **Apify Dataset Ready**: Emits clean, structured JSON ready for analytics, research, and timelines.

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Apify Actor Entry                    │
│                      (src/main.ts)                     │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │     Crawlee / Playwright  │ (Fresh unauthenticated context)
              │   Browser Controller      │
              └─────────────┬─────────────┘
                            │
      ┌─────────────────────┴─────────────────────┐
      │                                           │
      ▼                                           ▼
┌─────────────────────────┐             ┌─────────────────────────┐
│     DOM Automation      │             │   Network Interceptor   │
│  - Open public post     │             │  - Listen /api/graphql/ │
│  - Click reshares trigger│             │  - Detect friendly name │
│  - Scroll dialog target │             │  - Pass raw response    │
└─────────────────────────┘             └───────────┬─────────────┘
                                                    │
                                        ┌───────────▼─────────────┐
                                        │  GraphQL Pure Parser    │
                                        │  (src/graphql/)         │
                                        │  - Extract creation_time│
                                        │  - Extract sharer info  │
                                        │  - Extract cursor/page  │
                                        └───────────┬─────────────┘
                                                    │
                                        ┌───────────▼─────────────┐
                                        │ Deduplication & Dataset │
                                        │  (src/utils/dedupe.ts)  │
                                        │  - Actor.pushData()     │
                                        └─────────────────────────┘
```

---

## Input Configuration

The Actor accepts the following parameters via `.actor/input_schema.json`:

```json
{
  "postUrls": [
    "https://www.facebook.com/4914293075523572"
  ],
  "maxSharesPerPost": 1000,
  "maxScrollAttempts": 1000,
  "scrollDelayMs": 1000,
  "timezone": "Asia/Ho_Chi_Minh",
  "debug": false
}
```

### Options Description

| Field | Type | Default | Description |
|---|---|---|---|
| `postUrls` | `string[]` | *Required* | List of public Facebook post URLs. |
| `maxSharesPerPost` | `number` | `1000` | Stop condition: maximum number of shares to collect per post. |
| `maxScrollAttempts` | `number` | `1000` | Safety limit on dialog scroll actions to prevent infinite loops. |
| `scrollDelayMs` | `number` | `1000` | Throttle time between scroll actions for Facebook lazy loading. |
| `timezone` | `string` | `"Asia/Ho_Chi_Minh"` | IANA timezone used for `sharedAtLocal`. |
| `debug` | `boolean` | `false` | Enable verbose diagnostic logging. |

---

## Output Dataset Schema

Each scraped reshare record pushed to the Apify Dataset contains:

```json
{
  "originalPostUrl": "https://www.facebook.com/4914293075523572",
  "feedbackId": "ZmVlZGJhY2s6NDkxNDI5MzA3NTUyMzU3Mg==",
  "sharerName": "Bim Bi",
  "sharerId": "100001234567890",
  "sharerProfileUrl": "https://www.facebook.com/profile.php?id=100001234567890",
  "sharePostId": "4914293075523572",
  "shareStoryId": "UzpfSTEwMDAwMTIzNDU2Nzg5MDoyODk0NzMz",
  "shareUrl": "https://facebook.com/example/posts/4914293075523572",
  "sharedAtUnix": 1785512929,
  "sharedAtIso": "2026-07-31T15:48:49.000Z",
  "sharedAtLocal": "2026-07-31 22:48:49 GMT+7",
  "visibility": "Public",
  "scrapedAt": "2026-09-26T08:30:00.000Z"
}
```

---

## Development & Testing

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x

### Setup
```bash
npm install
```

### Running Tests
```bash
# Run unit and contract tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### Type Checking
```bash
npm run lint
```

### Building Actor
```bash
npm run build
```

---

## Limitations

1. **Public Reshares Only**: Private, friends-only, or direct message shares are hidden by Facebook and inaccessible unauthenticated.
2. **Facebook Display Cap**: Facebook frontend may truncate the visible public reshare feed after a few hundred to a couple thousand items regardless of the total share counter.
3. **DOM Volatility**: If Facebook alters the markup for the reshare counter trigger button, selectors in `src/facebook/selectors.ts` may need updating. GraphQL parser remains independent.

---

## License
ISC
