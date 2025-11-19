const socket = io();
const container = document.getElementById('word-cloud-container');
const statusDiv = document.getElementById('status');
const loadingDiv = document.getElementById('loading');

let currentData = [];

// Color scale
const fill = d3.scaleOrdinal(d3.schemeCategory10);

socket.on('connect', () => {
    statusDiv.textContent = 'Connected to server';
});

socket.on('disconnect', () => {
    statusDiv.textContent = 'Disconnected from server';
});

socket.on('trends-update', (data) => {
    console.log('Received trends:', data);
    statusDiv.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

    if (data && data.length > 0) {
        currentData = data;
        loadingDiv.style.display = 'none';
        updateWordCloud();
    } else {
        statusDiv.textContent += ' (No data available)';
    }
});

const limitSelect = document.getElementById('term-limit');
limitSelect.addEventListener('change', () => {
    if (currentData.length > 0) {
        updateWordCloud();
    }
});

function updateWordCloud() {
    const limit = limitSelect.value;
    let words = [...currentData];

    if (limit !== 'all') {
        words = words.slice(0, parseInt(limit));
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

    // Color scale: High volume = Pure White, Low volume = Gray
    // Using Log scale to handle the wide distribution of search volumes (e.g. 10K vs 1M+)
    // Range is from a visible gray to pure white to create a smooth gradient
    const colorScale = d3.scaleLog()
        .domain(sizeExtent)
        .range(["#666666", "#ffffff"]);

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

// Handle window resize
window.addEventListener('resize', () => {
    if (currentData.length > 0) {
        drawWordCloud(currentData);
    }
});
