const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('./logger');

puppeteer.use(StealthPlugin());

const TRENDS_URL = 'https://trends.google.com/trending?geo=CA&hl=en-us';

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

const scrapeTrends = async () => {
    let browser;
    try {
        logger.info('Starting scrape job...');

        const launchOptions = {
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                // Flags to reduce memory and fix container issues
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

        // On Mac, if not in production/CI, try to use local Chrome if bundled is missing/failing
        // But for Railway, we rely on default or PUPPETEER_EXECUTABLE_PATH
        if (process.platform === 'darwin' && !process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();

        // Anti-detection: Set random User-Agent
        const userAgent = getRandomUserAgent();
        await page.setUserAgent(userAgent);
        logger.info(`Using User-Agent: ${userAgent}`);

        // Anti-detection: Set viewport to a common resolution
        await page.setViewport({ width: 1920, height: 1080 });

        logger.info(`Navigating to ${TRENDS_URL}`);
        await page.goto(TRENDS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for trends table to load (Google Trends uses client-side rendering)
        await page.waitForSelector('tbody tr, .feed-item', { timeout: 10000 });

        // Small additional delay for dynamic content to fully render
        await delay(1000);

        // Anti-detection: Random delay before interacting
        await delay(500 + Math.random() * 1000);

        // Wait for the trending list to load
        // Note: Already waited for selector after navigation, so trends should be loaded



        let allTrends = [];
        let pageNum = 1;
        const MAX_ITEMS = 500; // Increased limit to capture all daily trends (usually ~300)

        while (allTrends.length < MAX_ITEMS) {
            logger.info(`Scraping page ${pageNum}...`);

            const pageTrends = await page.evaluate(() => {
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

            if (pageTrends.length === 0) {
                logger.warn(`No trends found on page ${pageNum}. Stopping.`);
                break;
            }

            // Add new trends, avoiding duplicates if any (though pagination should handle this)
            // Simple check to avoid adding same page data if click failed
            const newTrends = pageTrends.filter(t => !allTrends.some(existing => existing.text === t.text));
            if (newTrends.length === 0 && allTrends.length > 0) {
                logger.warn('No new trends found after pagination. Stopping.');
                break;
            }

            allTrends = [...allTrends, ...newTrends];
            logger.info(`Collected ${allTrends.length} trends so far.`);

            if (allTrends.length >= MAX_ITEMS) break;

            // Click Next button
            const nextButton = await page.$('button[aria-label="Go to next page"]');
            if (nextButton) {
                // Check if disabled
                const isDisabled = await page.evaluate(el => el.disabled || el.getAttribute('aria-disabled') === 'true', nextButton);
                if (isDisabled) {
                    logger.info('Next button is disabled. Reached end of list.');
                    break;
                }

                logger.info('Clicking next page...');
                const previousRowCount = await page.$$eval('tbody tr', rows => rows.length);
                await nextButton.click();

                // Wait for new rows to appear (intelligent wait)
                try {
                    await page.waitForFunction(
                        (prevCount) => {
                            const currentRows = document.querySelectorAll('tbody tr');
                            return currentRows.length > prevCount || currentRows.length === 0;
                        },
                        { timeout: 2000 },
                        previousRowCount
                    );
                    // Additional small delay for rendering stability
                    await delay(300);
                } catch (e) {
                    // Fallback to shorter fixed delay if waitForFunction times out
                    await delay(800);
                }
                pageNum++;
            } else {
                logger.info('No next button found.');
                break;
            }
        }

        const trends = allTrends;

        logger.info(`Scraped ${trends.length} trends.`);

        if (trends.length === 0) {
            // Capture HTML for debugging if empty
            const html = await page.content();
            logger.error('Scraped 0 trends. Page content length: ' + html.length);
        }

        return trends;

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
