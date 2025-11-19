# Google Trends Word Cloud

## Project Overview
This project is a real-time web application that visualizes Google Trends data for Canada as an interactive word cloud. It uses a headless browser to scrape data and WebSockets to push updates to the client.

## Technology Stack
- **Backend**: Node.js, Express
- **Scraping**: Puppeteer (with `puppeteer-extra-plugin-stealth`)
- **Real-time**: Socket.io
- **Frontend**: HTML5, CSS3, JavaScript
- **Visualization**: D3.js, d3-cloud

## Features
- **Real-time Updates**: Scrapes Google Trends every 15 minutes.
- **Interactive Word Cloud**: Clickable terms that link to Google Search.
- **Data Control**: Dropdown to select the number of terms to display (25, 50, 75, 100, All).
- **Pagination Support**: Scraper automatically navigates through pages to fetch all available trends.
- **Visual Customization**:
    - **Dark Mode**: High-contrast black background with white text.
    - **Horizontal Layout**: All words are oriented horizontally for readability.
    - **Volume-Based Sizing**: Uses a square root scale to proportionally size words based on search volume.
    - **Volume-Based Coloring**: Logarithmic color gradient (gray to white) indicating search popularity.

## Key Components

### Backend
- **`server.js`**: Entry point. Sets up the Express server, Socket.io instance, and schedules the scraping job (every 15 minutes).
- **`scraper.js`**: Handles the scraping logic.
  - Uses system Chrome executable to avoid crashes on macOS.
  - Implements anti-detection measures (User-Agent rotation, random delays).
  - **New**: Handles pagination (clicking "Next") to scrape up to 500 items.
  - Extracts trend terms and search volumes.
- **`logger.js`**: Simple logging utility using Winston.

### Frontend
- **`public/index.html`**: Minimalist, full-screen layout with a floating dropdown control.
- **`public/script.js`**: 
  - Connects to the WebSocket server.
  - Receives trend data.
  - Renders the word cloud using D3.js with `d3-cloud`.
  - Implements `scaleSqrt` for sizing and `scaleLog` for coloring.
  - Handles filtering based on the selected term limit.
- **`public/style.css`**: Dark mode styling, full-screen container, and floating controls.

## Setup & Running
1. **Install Dependencies**: `npm install`
2. **Start Server**: `npm start`
3. **View App**: Open `http://localhost:3000`

## Notes
- **Scraping Robustness**: The scraper relies on DOM selectors which may change over time. If no data appears, check `scraper.js` selectors against the current Google Trends page structure.
- **Puppeteer Configuration**: The scraper is configured to use the system's Google Chrome installation (`executablePath`) to ensure stability on macOS.
- **Data Limits**: The "All available" option fetches all daily trends provided by Google (typically ~300), capped at 500 internally.
