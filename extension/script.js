// CONFIGURATION
// REPLACE THIS WITH YOUR RAILWAY URL WHEN DEPLOYED
const SERVER_URL = 'https://web-production-8dc30.up.railway.app';
// const SERVER_URL = 'http://localhost:3000';

const container = document.getElementById('word-cloud-container');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const limitSelect = document.getElementById('term-limit');

let currentData = [];
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
const CACHE_KEY = 'cached_trends';
const CACHE_TIMESTAMP_KEY = 'cache_timestamp';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Load saved preference
chrome.storage.local.get(['termLimit'], async (result) => {
    if (result.termLimit) {
        limitSelect.value = result.termLimit;
    }

    // Try to load from cache immediately for instant display
    const cached = await loadFromCache();
    if (cached) {
        currentData = cached;
        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.style.color = '#999';
        errorDiv.innerHTML = 'Loading fresh data...';
        updateWordCloud();
    }

    // Then fetch fresh data (will update if successful)
    fetchTrends();
});

limitSelect.addEventListener('change', () => {
    const limit = limitSelect.value;
    // Save preference
    chrome.storage.local.set({ termLimit: limit });
    if (currentData.length > 0) {
        updateWordCloud();
    }
});

async function fetchTrends(retryCount = 0) {
    try {
        const response = await fetch(`${SERVER_URL}/api/trends`, {
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        const data = result.data || result; // Handle both formats

        console.log('Fetched trends:', data);

        if (data && data.length > 0) {
            currentData = data;

            // Cache the data locally
            await chrome.storage.local.set({
                [CACHE_KEY]: data,
                [CACHE_TIMESTAMP_KEY]: Date.now()
            });

            loadingDiv.style.display = 'none';
            errorDiv.style.display = 'none';
            updateWordCloud();

            // Show freshness indicator
            if (result.fresh === false) {
                errorDiv.style.display = 'block';
                errorDiv.style.color = '#999';
                errorDiv.innerHTML = 'Showing cached data from server';
                setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
            }
        } else {
            throw new Error('No trends data available');
        }
    } catch (error) {
        console.error(`Error fetching trends (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);

        // Try to load from local cache
        const cached = await loadFromCache();
        if (cached) {
            console.log('Loaded from local cache');
            currentData = cached;
            loadingDiv.style.display = 'none';
            errorDiv.style.display = 'block';
            errorDiv.style.color = '#999';
            errorDiv.innerHTML = 'Showing cached data (server unreachable)';
            updateWordCloud();
            return;
        }

        // Retry logic
        if (retryCount < MAX_RETRIES) {
            const delay = Math.min(
                INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
                MAX_RETRY_DELAY
            );

            loadingDiv.textContent = `Connection failed. Retrying in ${Math.round(delay/1000)}s... (${retryCount + 1}/${MAX_RETRIES})`;

            setTimeout(() => fetchTrends(retryCount + 1), delay);
        } else {
            // All retries exhausted
            loadingDiv.style.display = 'none';
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = `
                Could not connect to server at ${SERVER_URL}.<br>
                Please check your internet connection or try again later.<br>
                <button id="retry-btn" style="margin-top: 10px; padding: 8px 16px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 4px;">
                    Retry Now
                </button>
            `;

            // Add retry button handler
            document.getElementById('retry-btn').addEventListener('click', () => {
                errorDiv.style.display = 'none';
                loadingDiv.style.display = 'block';
                loadingDiv.textContent = 'Retrying...';
                fetchTrends(0);
            });
        }
    }
}

async function loadFromCache() {
    try {
        const result = await chrome.storage.local.get([CACHE_KEY, CACHE_TIMESTAMP_KEY]);

        if (result[CACHE_KEY] && result[CACHE_TIMESTAMP_KEY]) {
            const age = Date.now() - result[CACHE_TIMESTAMP_KEY];

            // Accept cache up to 1 hour old
            if (age < CACHE_TTL) {
                return result[CACHE_KEY];
            } else {
                console.log('Cache expired, age:', age);
            }
        }
    } catch (error) {
        console.error('Error loading from cache:', error);
    }

    return null;
}

function updateWordCloud() {
    const limit = limitSelect.value;
    let words = [...currentData];

    if (limit !== 'all') {
        words = words.slice(0, parseInt(limit));
    }

    drawWordCloud(words);
}

function drawWordCloud(words) {
    d3.select("#word-cloud-container svg").remove();

    const width = container.clientWidth;
    const height = container.clientHeight;

    const sizeExtent = d3.extent(words, d => d.size);

    const sizeScale = d3.scaleSqrt()
        .domain(sizeExtent)
        .range([15, 90]);

    const colorScale = d3.scaleLog()
        .domain(sizeExtent)
        .range(["#666666", "#ffffff"]);

    const layout = d3.layout.cloud()
        .size([width, height])
        .words(words.map(d => ({ text: d.text, size: sizeScale(d.size), rawSize: d.size })))
        .padding(5)
        .rotate(0)
        .font("Impact")
        .fontSize(d => d.size)
        .on("end", draw);

    layout.start();

    function draw(drawnWords) {
        d3.select("#word-cloud-container").html("");
        d3.select("#word-cloud-container").append("svg")
            .attr("width", layout.size()[0])
            .attr("height", layout.size()[1])
            .append("g")
            .attr("transform", "translate(" + layout.size()[0] / 2 + "," + layout.size()[1] / 2 + ")")
            .selectAll("text")
            .data(drawnWords)
            .enter().append("text")
            .style("font-size", d => d.size + "px")
            .style("font-family", "Impact")
            .style("fill", d => colorScale(d.rawSize))
            .attr("text-anchor", "middle")
            .attr("transform", d => "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")")
            .text(d => d.text)
            .on("click", (event, d) => {
                const query = encodeURIComponent(d.text);
                window.open(`https://www.google.com/search?q=${query}`, '_blank');
            })
            .append("title")
            .text(d => `Search Volume: ~${d.rawSize}`);
    }
}

window.addEventListener('resize', () => {
    if (currentData.length > 0) {
        drawWordCloud(currentData);
    }
});
