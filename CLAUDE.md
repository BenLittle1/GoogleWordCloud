# Google Trends Word Cloud

Real-time Google Trends scraper that displays trending search terms as an interactive word cloud.

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Scraping**: Puppeteer with puppeteer-extra-plugin-stealth
- **Frontend**: D3.js (d3-cloud for word cloud layout)
- **Logging**: Winston
- **Deployment**: Railway (Docker-based)
- 

## Project Structure

```
├── server.js          # Express server, Socket.IO, scheduling
├── scraper.js         # Puppeteer scraping logic for Google Trends
├── logger.js          # Winston logger configuration
├── public/            # Web frontend (served by Express)
│   ├── index.html
│   ├── script.js      # D3.js word cloud rendering
│   └── style.css
├── extension/         # Chrome extension (new tab override)
│   ├── manifest.json
│   ├── newtab.html
│   ├── script.js
│   ├── style.css
│   └── lib/           # D3 libraries
├── Dockerfile         # Alpine-based with Chromium
└── railway.toml       # Railway deployment config
```

## Key Components

### Server (server.js)

- Serves static files from `public/`
- REST endpoint: `GET /api/trends` returns latest scraped trends
- WebSocket broadcasts trends to connected clients
- Scrapes on startup, then every 30 minutes

### Scraper (scraper.js)

- Target URL: `https://trends.google.com/trending?geo=CA&hl=en-us` (Canada)
- Uses stealth plugin and random user agents to avoid detection
- Paginates through results (up to 500 items)
- Returns array of `{ text, size, volumeText }` objects

### Frontend (public/script.js)

- Connects via Socket.IO for real-time updates
- D3.js word cloud with sqrt scale for font sizes
- Click on terms opens Google search in new tab

### Chrome Extension (extension/)

- Replaces new tab page with the word cloud
- Fetches from Railway-deployed API or localhost

## Development

```bash
npm install
npm run dev    # Uses nodemon for auto-restart
```

Server runs at `http://localhost:3000`

## Environment Notes

- On macOS: Uses local Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- In Docker/Railway: Uses system Chromium via `PUPPETEER_EXECUTABLE_PATH`
- Scraper uses headless mode with sandbox disabled for container compatibility

## Common Issues

- **Empty word cloud**: Google may have changed DOM structure; check `tbody tr` selectors in scraper.js
- **Scrape failures**: Check logs in `app.log`; may need to adjust delays or user agents
- **Extension not working**: Verify API URL in extension/script.js matches deployed server
