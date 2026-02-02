const socket = io();
const container = document.getElementById('word-cloud-container');
const statusDiv = document.getElementById('status');
const loadingDiv = document.getElementById('loading');

let currentData = [];
const INITIAL_LOAD_TIMEOUT = 15000; // 15 seconds
let initialLoadTimer = null;
let dataReceived = false;

// Physics mode state
let physicsMode = localStorage.getItem('physicsMode') === 'true';
let simulation = null;

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

// Track the last data timestamp to avoid unnecessary redraws
let lastDataTimestamp = null;

socket.on('trends-update', (response) => {
    // Clear timeout
    if (initialLoadTimer) {
        clearTimeout(initialLoadTimer);
        initialLoadTimer = null;
    }

    dataReceived = true;
    const data = response.data || response; // Handle both formats

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
        // Only redraw if this is new data (different timestamp) or first load
        const isNewData = !lastDataTimestamp || response.timestamp !== lastDataTimestamp;
        const isFirstLoad = currentData.length === 0;

        if (isNewData || isFirstLoad) {
            console.log('New data received, updating word cloud');
            lastDataTimestamp = response.timestamp;
            currentData = data;
            loadingDiv.style.display = 'none';
            updateWordCloud();
        } else {
            console.log('Same data received, skipping redraw');
        }
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

// Load saved physics mode preference
if (physicsMode) {
    document.getElementById('physics-toggle').checked = true;
}

// Initialize active term button
document.addEventListener('DOMContentLoaded', () => {
    // Remove any existing active classes first
    document.querySelectorAll('.term-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Set the correct one as active
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

    if (physicsMode) {
        drawPhysicsCloud(words);
    } else {
        // Stop any running physics simulation
        if (simulation) {
            simulation.stop();
            simulation = null;
        }
        drawWordCloud(words);
    }
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

// Cache for text measurements to avoid repeated DOM operations
const textMeasureCache = new Map();

// Reusable SVG element for measuring text (created once)
let measureSvg = null;
let measureTextEl = null;

function getMeasureSvg() {
    if (!measureSvg) {
        measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        measureSvg.style.position = 'absolute';
        measureSvg.style.visibility = 'hidden';
        measureSvg.style.pointerEvents = 'none';
        document.body.appendChild(measureSvg);

        measureTextEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        measureTextEl.setAttribute('font-family', 'Impact');
        measureSvg.appendChild(measureTextEl);
    }
    return { svg: measureSvg, textEl: measureTextEl };
}

// Measure actual text dimensions using a reusable SVG element
function measureText(text, fontSize) {
    const cacheKey = `${text}-${fontSize}`;
    if (textMeasureCache.has(cacheKey)) {
        return textMeasureCache.get(cacheKey);
    }

    try {
        const { textEl } = getMeasureSvg();
        textEl.setAttribute('font-size', fontSize + 'px');
        textEl.textContent = text;

        const bbox = textEl.getBBox();
        const result = { width: bbox.width, height: bbox.height };
        textMeasureCache.set(cacheKey, result);
        return result;
    } catch (e) {
        // Fallback to approximation if getBBox fails
        console.warn('measureText failed, using approximation:', e);
        const result = {
            width: fontSize * text.length * 0.6,
            height: fontSize
        };
        textMeasureCache.set(cacheKey, result);
        return result;
    }
}

// Calculate text dimensions for boundary checking
function calculateTextDimensions(text, fontSize) {
    const measured = measureText(text, fontSize);
    // Add padding for safety
    const padding = 20;
    const halfWidth = measured.width / 2 + padding;
    const halfHeight = measured.height / 2 + padding;
    // Radius for word-to-word collision (use the larger dimension)
    const radius = Math.max(halfWidth, halfHeight);
    return { halfWidth, halfHeight, radius };
}

// Simple animation frame loop for smooth physics
let animationFrameId = null;

// Initialize physics - just starts the animation loop
function initPhysicsSimulation(nodes) {
    // Store nodes for the animation
    simulation = { nodes: () => nodes, stop: () => cancelAnimationFrame(animationFrameId) };

    // Start animation loop
    function animate() {
        renderPhysics();
        animationFrameId = requestAnimationFrame(animate);
    }
    animationFrameId = requestAnimationFrame(animate);
}

// Physics constants for smooth screensaver-like motion
const MIN_VELOCITY = 0.2;  // Minimum speed to keep things moving
const MAX_VELOCITY = 0.8;  // Cap speed for calm motion

// Render physics simulation tick
function renderPhysics() {
    if (!simulation) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const nodes = simulation.nodes();

    // Process each node
    nodes.forEach(d => {
        // Check if node is NOT being dragged
        const isBeingDragged = d.fx != null || d.fy != null;

        if (!isBeingDragged) {
            // Move the node by its velocity
            d.x += d.vx;
            d.y += d.vy;

            // Boundary enforcement
            const minX = d.halfWidth;
            const maxX = width - d.halfWidth;
            const minY = d.halfHeight;
            const maxY = height - d.halfHeight;

            // Bounce off walls
            if (d.x <= minX) {
                d.x = minX;
                d.vx = Math.abs(d.vx);
            } else if (d.x >= maxX) {
                d.x = maxX;
                d.vx = -Math.abs(d.vx);
            }

            if (d.y <= minY) {
                d.y = minY;
                d.vy = Math.abs(d.vy);
            } else if (d.y >= maxY) {
                d.y = maxY;
                d.vy = -Math.abs(d.vy);
            }
        } else {
            // Being dragged - update position to fixed position
            d.x = d.fx;
            d.y = d.fy;
        }
    });

    d3.select('#word-cloud-container svg g')
        .selectAll('text')
        .data(nodes)
        .attr('transform', d => `translate(${d.x}, ${d.y})`);
}

// Drag event handlers for physics mode
function dragstarted(event, d) {
    // Fix the node position while dragging
    d.fx = d.x;
    d.fy = d.y;
    // Track drag start position for velocity calculation
    d.dragStartX = event.x;
    d.dragStartY = event.y;
    d.dragStartTime = Date.now();
    d3.select(this).style('cursor', 'grabbing');
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    // Track last position for velocity
    d.lastDragX = event.x;
    d.lastDragY = event.y;
    d.lastDragTime = Date.now();
}

function dragended(event, d) {
    // Release the node
    d.fx = null;
    d.fy = null;

    // Give it a gentle random velocity after drag
    const angle = Math.random() * 2 * Math.PI;
    const speed = MIN_VELOCITY + Math.random() * (MAX_VELOCITY - MIN_VELOCITY);
    d.vx = Math.cos(angle) * speed;
    d.vy = Math.sin(angle) * speed;

    d3.select(this).style('cursor', 'grab');
}

// Draw physics-enabled word cloud
function drawPhysicsCloud(words) {
    // Stop existing simulation
    if (simulation) {
        simulation.stop();
        simulation = null;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear previous content
    d3.select("#word-cloud-container").html("");

    // Normalize sizes
    const sizeExtent = d3.extent(words, d => d.size);

    const sizeScale = d3.scaleSqrt()
        .domain(sizeExtent)
        .range([15, 90]);

    // Color scale: Adapt to theme
    const isLightMode = document.body.classList.contains('light-mode');
    const colorScale = d3.scaleLog()
        .domain(sizeExtent)
        .range(isLightMode ? ["#999999", "#1a1a1a"] : ["#666666", "#ffffff"]);

    // Create nodes with initial random positions and velocities
    const nodes = words.map(d => {
        const fontSize = sizeScale(d.size);
        const dims = calculateTextDimensions(d.text, fontSize);

        // Clamp dimensions if word is too big for screen
        const halfWidth = Math.min(dims.halfWidth, width / 2 - 10);
        const halfHeight = Math.min(dims.halfHeight, height / 2 - 10);

        // Calculate safe spawn area
        const spawnWidth = Math.max(1, width - halfWidth * 2);
        const spawnHeight = Math.max(1, height - halfHeight * 2);

        // Random angle for initial velocity direction
        const angle = Math.random() * 2 * Math.PI;
        const speed = MIN_VELOCITY + Math.random() * (MAX_VELOCITY - MIN_VELOCITY); // Calm speed
        return {
            text: d.text,
            size: fontSize,
            rawSize: d.size,
            // Start within safe bounds
            x: halfWidth + Math.random() * spawnWidth,
            y: halfHeight + Math.random() * spawnHeight,
            vx: Math.cos(angle) * speed,  // Initial velocity
            vy: Math.sin(angle) * speed,
            halfWidth: halfWidth,
            halfHeight: halfHeight,
            radius: dims.radius, // For word-to-word collision
            color: colorScale(d.size)
        };
    });

    // Create SVG (no centering transform needed for physics)
    const svg = d3.select("#word-cloud-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g");

    // Initialize simulation
    initPhysicsSimulation(nodes);

    // Create text elements bound to simulation nodes
    svg.selectAll("text")
        .data(nodes)
        .enter()
        .append("text")
        .style("font-size", d => d.size + "px")
        .style("font-family", "Impact")
        .style("fill", d => d.color)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .text(d => d.text)
        .style("cursor", "grab")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended)
        )
        .on("click", (event, d) => {
            // Only trigger click if not dragging
            if (!event.defaultPrevented) {
                window.open(`https://www.google.com/search?q=${encodeURIComponent(d.text)}`, '_blank');
            }
        })
        .append("title")
        .text(d => `Search Volume: ~${d.rawSize}`);
}

// Handle window resize - use updateWordCloud to respect filter
window.addEventListener('resize', () => {
    if (simulation) {
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Update SVG size
        d3.select('#word-cloud-container svg')
            .attr('width', width)
            .attr('height', height);

        // Constrain any nodes that are now outside the new bounds
        simulation.nodes().forEach(d => {
            const minX = d.halfWidth;
            const maxX = width - d.halfWidth;
            const minY = d.halfHeight;
            const maxY = height - d.halfHeight;

            if (d.x < minX) d.x = minX;
            if (d.x > maxX) d.x = maxX;
            if (d.y < minY) d.y = minY;
            if (d.y > maxY) d.y = maxY;
        });
    } else if (currentData.length > 0) {
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

// Physics Mode Toggle
const physicsToggle = document.getElementById('physics-toggle');
physicsToggle.addEventListener('change', () => {
    physicsMode = physicsToggle.checked;
    localStorage.setItem('physicsMode', physicsMode);
    // Redraw word cloud with new mode
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
