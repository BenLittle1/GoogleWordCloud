const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('./logger');

puppeteer.use(StealthPlugin());

// Multiple regions to aggregate more trends (20-23 per region)
const TRENDS_SOURCES = [
    { url: 'https://trends.google.com/trending?geo=CA&hl=en-us', region: 'Canada' },
    { url: 'https://trends.google.com/trending?geo=US&hl=en-us', region: 'United States' },
    { url: 'https://trends.google.com/trending?geo=GB&hl=en-us', region: 'United Kingdom' },
    { url: 'https://trends.google.com/trending?geo=AU&hl=en-us', region: 'Australia' },
    { url: 'https://trends.google.com/trending?geo=IN&hl=en-us', region: 'India' },
    { url: 'https://trends.google.com/trending?geo=&hl=en-us', region: 'Global' },
];

// List of user agents for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

const getRandomUserAgent = () => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to extract trends from current page DOM
const extractTrendsFromDOM = async (page) => {
    return await page.evaluate(() => {
        const data = [];
        const rows = document.querySelectorAll('tbody tr');

        if (rows.length > 0) {
            rows.forEach(row => {
                try {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        let term = '';
                        let volume = 0;
                        let volumeText = '';

                        cells.forEach(cell => {
                            const text = cell.innerText.trim();
                            if (!text) return;

                            if (text.includes('+') && (text.includes('K') || text.includes('M'))) {
                                volumeText = text;
                                let num = parseFloat(text.replace(/[^0-9.]/g, ''));
                                if (text.includes('M')) num *= 1000000;
                                else if (text.includes('K')) num *= 1000;
                                volume = num;
                            } else if (!term && text.length > 2 && !text.match(/^\d+$/)) {
                                term = text.split('\n')[0];
                            }
                        });

                        if (term && volume > 0) {
                            data.push({ text: term, size: volume, volumeText });
                        }
                    }
                } catch (e) { }
            });
        }
        return data;
    });
};

// Scrape trends from a single URL
const scrapeFromURL = async (page, url, region) => {
    try {
        logger.info(`Scraping ${region}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for trends table to load
        await page.waitForSelector('tbody tr, .feed-item', { timeout: 10000 });
        await delay(1000);

        // Extract trends
        const trends = await extractTrendsFromDOM(page);
        logger.info(`${region}: Found ${trends.length} trends`);

        return trends;
    } catch (error) {
        logger.error(`Error scraping ${region}: ${error.message}`);
        return [];
    }
};

// Main scraping function - aggregates trends from multiple regions
const scrapeTrends = async () => {
    let browser;
    try {
        logger.info('Starting multi-region scrape job...');

        const launchOptions = {
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                '--disable-crash-reporter',
                '--disable-breakpad',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--disable-features=VizDisplayCompositor',
                '--disable-software-rasterizer'
            ]
        };

        // On Mac, use local Chrome
        if (process.platform === 'darwin' && !process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        // Anti-detection setup
        const userAgent = getRandomUserAgent();
        await page.setUserAgent(userAgent);
        await page.setViewport({ width: 1920, height: 1080 });
        logger.info(`Using User-Agent: ${userAgent}`);

        // Use Set for efficient duplicate detection across all regions
        const seenTexts = new Set();
        let allTrends = [];

        // Scrape from each source
        for (const source of TRENDS_SOURCES) {
            const trends = await scrapeFromURL(page, source.url, source.region);

            // Add unique trends only
            trends.forEach(trend => {
                if (!seenTexts.has(trend.text)) {
                    seenTexts.add(trend.text);
                    allTrends.push(trend);
                }
            });

            // Small delay between regions to avoid rate limiting
            await delay(1000 + Math.random() * 1000);
        }

        logger.info(`Total unique trends aggregated: ${allTrends.length}`);

        if (allTrends.length === 0) {
            const html = await page.content();
            logger.error('Scraped 0 trends. Page content length: ' + html.length);
        }

        return allTrends;

    } catch (error) {
        logger.error(`Scraping failed: ${error.message}`);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

module.exports = { scrapeTrends };
