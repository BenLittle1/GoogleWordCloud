# Google Trends Word Cloud

A real-time web application that scrapes Google Trends data and displays it as an interactive word cloud using D3.js.

## Features

- **Automated Scraping**: Scrapes Google Trends (Canada) every 15 minutes.
- **Real-Time Updates**: Pushes new data to the client immediately via WebSockets.
- **Interactive Visualization**: D3.js word cloud with clickable terms that redirect to Google Search.
- **Anti-Detection**: Uses Puppeteer Stealth and randomized user agents to avoid blocking.

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1.  Clone the repository or navigate to the project directory.
2.  Install dependencies:

    ```bash
    npm install
    ```

## Usage

1.  Start the server:

    ```bash
    npm start
    ```

    Or for development with auto-restart:

    ```bash
    npm run dev
    ```

2.  Open your browser and navigate to:

    ```
    http://localhost:3000
    ```

3.  The application will perform an initial scrape immediately. Please wait a few seconds for the browser to launch (headless) and retrieve the data.
4.  The word cloud will update automatically every 15 minutes.

## Project Structure

- `server.js`: Main Express server and scheduler.
- `scraper.js`: Puppeteer logic for scraping Google Trends.
- `logger.js`: Logging utility.
- `public/`: Frontend files (HTML, CSS, JS).

## Troubleshooting

- **No Data**: If the word cloud remains empty, check the server console logs. Google might be blocking requests or the DOM structure might have changed.
- **Scraping Failed**: Ensure you have a stable internet connection. The scraper uses a headless browser which requires network access.

## License

ISC
