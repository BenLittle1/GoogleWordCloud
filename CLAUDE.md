# Google Trends Word Cloud

Real-time Google Trends scraper that displays trending search terms as an interactive word cloud. Aggregates trends from multiple regions worldwide with intelligent caching for fast load times.

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Scraping**: Puppeteer with puppeteer-extra-plugin-stealth
- **Caching**: Custom disk-based cache with 35-minute TTL
- **Frontend**: D3.js (d3-cloud for word cloud layout)
- **Logging**: Winston
- **Deployment**: Railway (Docker-based)

## Project Structure

```
├── server.js          # Express server, Socket.IO, scheduling
├── scraper.js         # Multi-region scraping logic for Google Trends
├── cache.js           # Disk-based caching system with 35-min TTL
├── logger.js          # Winston logger configuration
├── trends-cache.json  # Auto-generated cache file (gitignored)
├── public/            # Web frontend (served by Express)
│   ├── index.html
│   ├── script.js      # D3.js word cloud with settings UI
│   └── style.css
├── extension/         # Chrome extension (new tab override)
│   ├── manifest.json
│   ├── newtab.html
│   ├── script.js      # Extension with local caching
│   ├── style.css
│   └── lib/           # D3 libraries (d3.js, d3.layout.cloud.js)
├── Dockerfile         # Alpine-based with Chromium
├── railway.toml       # Railway deployment config
└── Procfile           # Process manager config (web: npm start)
```

## Key Components

### Server (server.js)

- Serves static files from `public/`
- REST endpoint: `GET /api/trends` returns trends with metadata
  ```javascript
  {
    data: [...trends],           // Array of trend objects
    timestamp: 1234567890,       // Last scrape time
    fresh: true,                 // True if data age < 30 minutes
    isScrapingInProgress: false, // Current scraping status
    age: 123456                  // Data age in milliseconds
  }
  ```
- WebSocket broadcasts trends to connected clients on updates
- Integrated with cache.js for fast startup and persistence
- Loads cached data asynchronously on startup (non-blocking)
- Scrapes immediately on startup, then every 30 minutes
- Saves trends to cache after each successful scrape

### Scraper (scraper.js)

**Multi-Region Aggregation:**
Scrapes Google Trends from 6 regions and deduplicates:
- Canada (CA)
- United States (US)
- United Kingdom (GB)
- Australia (AU)
- India (IN)
- Global (no geo filter)

**Scraping Strategy:**
- Uses puppeteer-extra-plugin-stealth to avoid detection
- Random user agent rotation for each request
- Set-based deduplication across all regions
- Optimized page load strategy: `domcontentloaded` (not `networkidle2`)
- Smart pagination with intelligent waits (checks for "See more" button)
- Typical results: ~95 unique trends (vs ~23 for single region)

**Performance:**
- Total scrape time: 8-12 seconds (optimized from 45-65s)
- Reduced anti-detection delays without triggering blocks
- Single browser instance reused across all regions

**Output Format:**
Returns array of `{ text, size, volumeText }` objects where:
- `text`: The trending search term
- `size`: Search volume (numeric)
- `volumeText`: Human-readable volume (e.g., "100K+ searches")

### Cache System (cache.js)

**Purpose:** Enables instant server startup and resilience against scraping failures

**Features:**
- Disk-based JSON cache with 35-minute TTL (5 minutes longer than scrape interval)
- Atomic writes using temp file + rename pattern (prevents corruption)
- Environment-aware path selection:
  - Railway/production: `/tmp/trends-cache.json` (ephemeral storage)
  - Local development: `./trends-cache.json` (project root)
- Async operations (non-blocking reads/writes)

**Cache Structure:**
```javascript
{
  timestamp: 1234567890,  // Unix timestamp (ms)
  data: [...trends]       // Array of trend objects
}
```

**Benefits:**
- Server starts in <1 second (vs 8-12s without cache)
- Survives scraping failures (serves stale data if fresh scrape fails)
- Reduces Google Trends request frequency on server restarts

### Frontend (public/script.js)

**Core Features:**
- Socket.IO connection for real-time updates
- D3.js word cloud with sqrt scale for font sizes
- Click on terms to open Google search in new tab
- Responsive design with window resize handling

**Settings Panel:**
- Collapsible slide-out UI with backdrop overlay
- Term limit options: 25, 50, 100, 150, 200, 250, or "All"
- Settings persisted to localStorage
- Keyboard shortcuts and smooth animations

**Status Indicators:**
- Last update timestamp (human-readable, e.g., "2 minutes ago")
- Cached vs fresh data indicator
- Scraping progress messages
- Error handling with user-friendly timeouts

### Chrome Extension (extension/)

**Core Functionality:**
- Overrides new tab page with word cloud interface (Manifest V3)
- Fetches trends from Railway-deployed server
- Local D3.js libraries included (no CDN dependencies)

**Smart Caching & Resilience:**
- Local cache in extension storage for instant loads
- Shows cached data immediately while fetching fresh data
- Graceful degradation if server is unreachable
- Retry logic with exponential backoff
- Server status indicators

**Settings Persistence:**
- User preferences saved across sessions
- Term limit settings synchronized with main app

## Performance Metrics

**Load Time Optimization (85-95% faster):**
- Server startup: <1 second (was 45-65s before caching)
- First scrape: 8-12 seconds (was 45-65s before optimization)
- Extension load: Instant with cached data
- User experience: No loading delays on server restart

**Scraping Efficiency:**
- Multi-region scraping: 8-12s total for 6 regions
- Per-region average: ~1.5-2 seconds
- Network strategy: `domcontentloaded` instead of `networkidle2`
- Results: ~95 unique trends per scrape cycle

**Optimization Techniques:**
1. Disk-based caching with 35-minute TTL
2. Async cache loading (non-blocking server startup)
3. Reduced anti-detection delays in scraper
4. Intelligent pagination waits (DOM checking vs fixed delays)
5. Single browser instance reused across regions
6. Set-based deduplication (O(1) lookups)

## Development

```bash
npm install
npm run dev    # Uses nodemon for auto-restart
```

Server runs at `http://localhost:3000`

## Environment Notes

**Browser Configuration:**
- macOS/local: Uses Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Docker/Railway: Uses system Chromium via `PUPPETEER_EXECUTABLE_PATH`
- Headless mode with `--no-sandbox` for container compatibility
- Additional flags for Railway stability: `--disable-dev-shm-usage`, `--disable-setuid-sandbox`

**Cache Behavior:**
- Local development: Cache stored at `./trends-cache.json` (project root)
- Railway production: Cache stored at `/tmp/trends-cache.json` (ephemeral)
- Detection: Checks `RAILWAY_ENVIRONMENT` or `NODE_ENV === 'production'`

**Port Configuration:**
- Default: `PORT=3000`
- Railway: Uses `process.env.PORT` (dynamically assigned)

## Common Issues

**Scraping Problems:**
- **Empty word cloud**: Google may have changed DOM structure; check `tbody tr` selectors in scraper.js
- **Scrape failures**: Check logs in `app.log`; may need to adjust delays or user agents
- **Timeout errors**: Multi-region scraping takes 8-12s; if it exceeds 30s, investigate network issues
- **Rate limiting**: Google may temporarily block IPs; wait 15-30 minutes or try different regions

**Cache Issues:**
- **Stale data showing**: Cache TTL is 35 minutes; if data is older, cache.js may have failed to update
- **Cache corruption**: Delete `trends-cache.json` (local) or restart Railway service to clear `/tmp`
- **Cache not loading**: Check file permissions (local) or disk space (Railway)
- **Server showing old data after deploy**: Railway ephemeral storage clears on restart; first scrape may take 8-12s

**Extension Problems:**
- **Extension not loading trends**: Verify server URL in extension/script.js matches deployment
- **Cached data never updates**: Check browser console for network errors
- **Settings not saving**: Clear extension storage and reload

**Performance Issues:**
- **Slow server startup**: Check if cache.js is loading properly; should be <1s with valid cache
- **Slow scraping**: Check if all 6 regions are responsive; a single slow region can delay entire scrape
- **Memory issues**: Monitor Puppeteer instances; should close properly after each scrape

**Debugging Tips:**
- Enable verbose logging: Check `app.log` for detailed scraper output
- Test single region: Temporarily modify `TRENDS_SOURCES` array in scraper.js
- Verify cache: Check timestamp in `trends-cache.json` matches recent scrape time
- Monitor Railway logs: Use `railway logs` command for production debugging
