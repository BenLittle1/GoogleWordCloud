// CONFIGURATION
// REPLACE THIS WITH YOUR RAILWAY URL WHEN DEPLOYED
// Example: const SERVER_URL = 'https://wordcloud-production.up.railway.app';
const SERVER_URL = 'http://localhost:3000';

const container = document.getElementById('word-cloud-container');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const limitSelect = document.getElementById('term-limit');

let currentData = [];

// Load saved preference
chrome.storage.local.get(['termLimit'], (result) => {
    if (result.termLimit) {
        limitSelect.value = result.termLimit;
    }
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

async function fetchTrends() {
    try {
        const response = await fetch(`${SERVER_URL}/api/trends`);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        console.log('Fetched trends:', data);

        if (data && data.length > 0) {
            currentData = data;
            loadingDiv.style.display = 'none';
            errorDiv.style.display = 'none';
            updateWordCloud();
        } else {
            loadingDiv.textContent = 'No trends available yet.';
        }
    } catch (error) {
        console.error('Error fetching trends:', error);
        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.innerHTML = `Could not connect to server at ${SERVER_URL}.<br>Make sure it is running.`;
    }
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
