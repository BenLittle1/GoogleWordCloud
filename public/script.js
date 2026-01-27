const socket = io();
const container = document.getElementById('word-cloud-container');
const statusDiv = document.getElementById('status');
const loadingDiv = document.getElementById('loading');

let currentData = [];
const INITIAL_LOAD_TIMEOUT = 15000; // 15 seconds
let initialLoadTimer = null;
let dataReceived = false;

// Color scale
const fill = d3.scaleOrdinal(d3.schemeCategory10);

socket.on('connect', () => {
    statusDiv.textContent = 'Connected to server';
    statusDiv.style.display = 'block';

    // Set timeout for initial data load
    if (!dataReceived) {
        initialLoadTimer = setTimeout(() => {
            if (!dataReceived) {
                loadingDiv.textContent = 'Taking longer than expected... Server may be scraping fresh data.';
                statusDiv.textContent = 'Waiting for trends data (this can take up to 2 minutes on first load)';
            }
        }, INITIAL_LOAD_TIMEOUT);
    }
});

socket.on('disconnect', () => {
    statusDiv.textContent = 'Disconnected from server - Attempting to reconnect...';
    statusDiv.style.display = 'block';
});

socket.on('connect_error', (error) => {
    loadingDiv.textContent = 'Connection error. Retrying...';
    statusDiv.textContent = `Error: ${error.message}`;
    statusDiv.style.display = 'block';
});

socket.on('status', (statusData) => {
    // Handle status updates from server
    if (statusData.isScrapingInProgress) {
        loadingDiv.textContent = statusData.message || 'Server is fetching fresh trends...';
        statusDiv.textContent = 'This may take a couple of minutes';
        statusDiv.style.display = 'block';
    }
});

socket.on('trends-update', (response) => {
    // Clear timeout
    if (initialLoadTimer) {
        clearTimeout(initialLoadTimer);
        initialLoadTimer = null;
    }

    dataReceived = true;
    const data = response.data || response; // Handle both formats

    console.log('Received trends:', data);

    const timestamp = response.timestamp
        ? new Date(response.timestamp).toLocaleTimeString()
        : new Date().toLocaleTimeString();

    let statusText = `Last updated: ${timestamp}`;

    // Add freshness indicator
    if (response.fresh === false) {
        statusText += ' (cached data)';
    }
    if (response.isScrapingInProgress) {
        statusText += ' - Refreshing...';
    }

    statusDiv.textContent = statusText;
    statusDiv.style.display = 'block';

    if (data && data.length > 0) {
        currentData = data;
        loadingDiv.style.display = 'none';
        updateWordCloud();
    } else {
        loadingDiv.textContent = 'No trends available yet. Please wait...';
    }
});

// Term limit management
let currentLimit = localStorage.getItem('termLimit') || '100';

// Load saved theme preference (default to dark)
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    document.getElementById('theme-toggle').checked = true;
}

// Initialize active term button
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.term-btn').forEach(btn => {
        if (btn.dataset.limit === currentLimit) {
            btn.classList.add('active');
        }
    });
});

// Term button handlers
document.querySelectorAll('.term-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all buttons
        document.querySelectorAll('.term-btn').forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        btn.classList.add('active');
        // Update limit
        currentLimit = btn.dataset.limit;
        localStorage.setItem('termLimit', currentLimit);
        // Update word cloud
        if (currentData.length > 0) {
            updateWordCloud();
        }
    });
});

function updateWordCloud() {
    let words = [...currentData];

    if (currentLimit !== 'all') {
        words = words.slice(0, parseInt(currentLimit));
    }

    drawWordCloud(words);
}

function drawWordCloud(words) {
    // Clear previous svg
    d3.select("#word-cloud-container svg").remove();

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Normalize sizes
    // Find min and max size in data to create a scale
    const sizeExtent = d3.extent(words, d => d.size);

    // Use a Sqrt scale to better represent volume differences without letting outliers dominate too much
    const sizeScale = d3.scaleSqrt()
        .domain(sizeExtent)
        .range([15, 90]); // Font size range

    // Color scale: Adapt to theme
    // Dark mode: High volume = Pure White, Low volume = Gray
    // Light mode: High volume = Dark, Low volume = Light Gray
    const isLightMode = document.body.classList.contains('light-mode');
    const colorScale = d3.scaleLog()
        .domain(sizeExtent)
        .range(isLightMode ? ["#999999", "#1a1a1a"] : ["#666666", "#ffffff"]);

    const layout = d3.layout.cloud()
        .size([width, height])
        .words(words.map(d => ({ text: d.text, size: sizeScale(d.size), rawSize: d.size })))
        .padding(5)
        .rotate(0) // Force horizontal orientation
        .font("Impact")
        .fontSize(d => d.size)
        .on("end", draw);

    layout.start();

    function draw(drawnWords) {
        d3.select("#word-cloud-container").html(""); // Clear previous
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
            .style("fill", d => colorScale(d.rawSize)) // Use color scale based on original volume
            .attr("text-anchor", "middle")
            .attr("transform", d => "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")")
            .text(d => d.text)
            .on("click", (event, d) => {
                const query = encodeURIComponent(d.text);
                window.open(`https://www.google.com/search?q=${query}`, '_blank');
            })
            .append("title") // Tooltip
            .text(d => `Search Volume: ~${d.rawSize}`); // Note: We lost exact volume text in mapping, using rawSize approximation or we could pass it through
    }
}

// Handle window resize - use updateWordCloud to respect filter
window.addEventListener('resize', () => {
    if (currentData.length > 0) {
        updateWordCloud();
    }
});

// Hamburger Menu Toggle
const menuToggle = document.getElementById('menu-toggle');
const menuDropdown = document.getElementById('menu-dropdown');

menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menuToggle.classList.toggle('active');
    menuDropdown.classList.toggle('open');
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!menuDropdown.contains(e.target) && !menuToggle.contains(e.target)) {
        menuToggle.classList.remove('active');
        menuDropdown.classList.remove('open');
    }
});

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
        document.body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
    }
    // Redraw word cloud with new theme colors
    if (currentData.length > 0) {
        updateWordCloud();
    }
});

// Close menu on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        menuToggle.classList.remove('active');
        menuDropdown.classList.remove('open');
    }
});
