const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log('Launching system Chrome...');
        const browser = await puppeteer.launch({
            headless: "new",
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('Browser launched.');
        const page = await browser.newPage();
        await page.goto('https://www.google.com');
        console.log('Navigated.');
        await browser.close();
        console.log('Done.');
    } catch (e) {
        console.error('Error:', e);
    }
})();
