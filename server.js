const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { scrapeTrends } = require('./scraper');
const logger = require('./logger');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const SCRAPE_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store latest trends
let latestTrends = [];

// Function to perform scraping and broadcast updates
const performScrape = async () => {
    try {
        logger.info('Initiating scheduled scrape...');
        const trends = await scrapeTrends();

        if (trends && trends.length > 0) {
            latestTrends = trends;
            logger.info(`Broadcasting ${trends.length} trends to clients.`);
            io.emit('trends-update', latestTrends);
        } else {
            logger.warn('No trends found or scraping failed. Retaining old data.');
        }
    } catch (error) {
        logger.error(`Error during scheduled scrape: ${error.message}`);
    }
};

// Initial scrape on startup
performScrape();

// Schedule scraping every 30 minutes
setInterval(performScrape, SCRAPE_INTERVAL);

// Socket.io connection handling
io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);

    // Send existing data to new client immediately
    if (latestTrends.length > 0) {
        socket.emit('trends-update', latestTrends);
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

// Start server
server.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
});
