const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { scrapeTrends } = require('./scraper');
const logger = require('./logger');
const cache = require('./cache');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const SCRAPE_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Enable CORS for all routes (allows extension to fetch data)
app.use(cors());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store latest trends
let latestTrends = [];
let isScrapingInProgress = false;
let lastScrapeTime = null;

// API Endpoint for Extension
app.get('/api/trends', (req, res) => {
    const age = lastScrapeTime ? Date.now() - lastScrapeTime : null;
    res.json({
        data: latestTrends,
        timestamp: lastScrapeTime,
        fresh: age ? age < 30 * 60 * 1000 : false,
        isScrapingInProgress: isScrapingInProgress,
        age: age
    });
});

// Function to perform scraping and broadcast updates
const performScrape = async (retryCount = 0) => {
    const MAX_RETRIES = 2;

    if (isScrapingInProgress) {
        logger.warn('Scrape already in progress, skipping...');
        return;
    }

    isScrapingInProgress = true;

    try {
        logger.info(`Initiating scheduled scrape...${retryCount > 0 ? ` (retry ${retryCount}/${MAX_RETRIES})` : ''}`);
        const trends = await scrapeTrends();

        if (trends && trends.length > 0) {
            latestTrends = trends;
            lastScrapeTime = Date.now();

            // Save to cache
            await cache.saveCache(trends);
            logger.info(`Scraped and cached ${trends.length} trends.`);

            // Broadcast to all connected clients
            io.emit('trends-update', {
                data: latestTrends,
                timestamp: lastScrapeTime,
                fresh: true
            });
        } else {
            logger.warn('No trends found or scraping failed. Retaining old data.');
            // Retry after a short delay
            if (retryCount < MAX_RETRIES) {
                isScrapingInProgress = false;
                logger.info(`Retrying in 60 seconds...`);
                setTimeout(() => performScrape(retryCount + 1), 60 * 1000);
                return;
            }
        }
    } catch (error) {
        logger.error(`Error during scheduled scrape: ${error.message}`);
        // Retry after a short delay
        if (retryCount < MAX_RETRIES) {
            isScrapingInProgress = false;
            logger.info(`Retrying in 60 seconds...`);
            setTimeout(() => performScrape(retryCount + 1), 60 * 1000);
            return;
        }
    } finally {
        isScrapingInProgress = false;
    }
};

// Load cache on startup
(async () => {
    const cached = await cache.loadCache();
    if (cached && cached.data && cached.data.length > 0) {
        latestTrends = cached.data;
        lastScrapeTime = cached.timestamp;
        logger.info(`Loaded ${cached.data.length} trends from cache (age: ${Math.round(cached.age/1000)}s)`);
    } else {
        logger.info('No valid cache found, will scrape fresh data.');
    }
})();

// Schedule scraping every 30 minutes
setInterval(performScrape, SCRAPE_INTERVAL);

// Socket.io connection handling
io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);

    // Always send data to new client, even if stale
    if (latestTrends.length > 0) {
        const age = lastScrapeTime ? Date.now() - lastScrapeTime : null;
        socket.emit('trends-update', {
            data: latestTrends,
            timestamp: lastScrapeTime,
            fresh: age ? age < 30 * 60 * 1000 : false,
            isScrapingInProgress: isScrapingInProgress
        });
    } else {
        // No data yet, let client know scraping is in progress
        socket.emit('status', {
            message: 'Fetching trends...',
            isScrapingInProgress: true
        });
    }

    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
    });
});

// Global Error Handlers to prevent crash
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`);
    // In production, you might want to exit, but for a persistent scraper we try to keep running
    // or let a process manager restart us. Here we log it.
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Start server immediately (non-blocking)
server.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);

    // Start initial scrape asynchronously
    performScrape().catch(err => {
        logger.error(`Initial scrape failed: ${err.message}`);
    });
});
