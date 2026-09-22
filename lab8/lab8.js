const DATA_DIR = "../data/";

const state = {
    data: [],
    matrix: [],
    summary: null,
    selectedId: null,
    matrixSelection: null,
    pointSelection: null,
    matrixCellSelection: null,
    xScale: null,
    yScale: null,
    radiusScale: null,
    colorScale: null,
    zoomBehavior: null,
    zoomLayer: null
};

const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const truncate = (value, max = 90) => {
    const text = String(value ?? "");
    return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
};

Promise.all([
    d3.csv(DATA_DIR + "lab8_embedding_map.csv", d => ({
        ...d,
        page: +d.page,
        word_count: +d.word_count,
        cluster: +d.cluster,
        x: +d.x,
        y: +d.y,
        neighbors: d.neighbors ? d.neighbors.split("|") : []
    })),
    d3.csv(DATA_DIR + "lab8_topic_section_matrix.csv", d => ({
        ...d,
        count: +d.count,
        proportion: +d.proportion
    })),
    d3.json(DATA_DIR + "lab8_summary.json")
])
.then(([data, matrix, summary]) => {
    state.data = data;
    state.matrix = matrix;
    state.summary = summary;

    renderCorpusDescription();
    renderOverviewCharts();
    setupFilters();
    drawSemanticMap();
    drawMatrix();
})
.catch(error => {
    console.error(error);
    d3.select(".lab8-main")
        .insert("div", ":first-child")
        .attr("class", "lab8-error")
        .html(
            "<strong>Lab 8 data could not be loaded.</strong> " +
            "Run <code>python preprocess_lab8.py</code> first, then view the site through a local server or GitHub Pages."
        );
});


// Corpus description and overview
function renderCorpusDescription() {
    const b = state.summary.bulletin;
    const c = state.summary.corpus;

    const metadata = [
        ["Bulletin", b.title],
        ["Version", b.version],
        ["Source", `<a href="${escapeHtml(b.source)}" target="_blank" rel="noopener">Official DKU PDF</a>`],
        ["Date accessed", b.date_accessed]
    ];

    d3.select("#lab8-bulletin-meta")
        .selectAll("div")
        .data(metadata)
        .join("div")
        .attr("class", "lab8-meta-item")
        .html(d => `<strong>${escapeHtml(d[0])}</strong><br>${d[1]}`);

    const stats = [
        [c.raw_passages.toLocaleString(), "Raw text blocks"],
        [c.cleaned_passages.toLocaleString(), "Passages after cleaning"],
        [c.average_passage_length, "Average words per passage"],
        [c.formal_sections, "Formal sections"]
    ];

    d3.select("#lab8-corpus-stats")
        .selectAll("div")
        .data(stats)
        .join("div")
        .attr("class", "lab8-stat-item")
        .html(d => `<span class="lab8-stat-number">${escapeHtml(d[0])}</span>${escapeHtml(d[1])}`);
}

function renderOverviewCharts() {
    drawHorizontalBarChart(
        "#lab8-terms-chart",
        state.summary.top_terms.slice(0, 10).map((term, i) => ({ label: term, value: 10 - i })),
        "Relative rank"
    );

    const sectionRows = Object.entries(state.summary.passages_by_section)
        .slice(0, 12)
        .map(([label, value]) => ({ label, value }));

    drawHorizontalBarChart("#lab8-sections-chart", sectionRows, "Passages");
}

function drawHorizontalBarChart(selector, rows, xLabel) {
    const width = 520;
    const rowHeight = 24;
    const margin = { top: 12, right: 20, bottom: 42, left: 185 };
    const height = margin.top + margin.bottom + rows.length * rowHeight;

    const svg = d3.select(selector)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("height", height);

    svg.selectAll("*").remove();

    const x = d3.scaleLinear()
        .domain([0, d3.max(rows, d => d.value) || 1])
        .nice()
        .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
        .domain(rows.map(d => d.label))
        .range([margin.top, height - margin.bottom])
        .padding(0.18);

    svg.selectAll(".lab8-chart-bar")
        .data(rows)
        .join("rect")
        .attr("class", "lab8-chart-bar")
        .attr("x", margin.left)
        .attr("y", d => y(d.label))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.value) - margin.left);

    svg.append("g")
        .attr("class", "lab8-axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5));

    svg.append("g")
        .attr("class", "lab8-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickFormat(d => truncate(d, 28)));

    svg.append("text")
        .attr("class", "lab8-chart-label")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 7)
        .attr("text-anchor", "middle")
        .text(xLabel);
}


// Filters and semantic map
function setupFilters() {
    const sections = Array.from(new Set(state.data.map(d => d.section))).sort(d3.ascending);
    const topics = Array.from(new Set(state.data.map(d => d.cluster_name))).sort(d3.ascending);

    d3.select("#lab8-section-filter")
        .selectAll("option.lab8-data-option")
        .data(sections)
        .join("option")
        .attr("class", "lab8-data-option")
        .attr("value", d => d)
        .text(d => d);

    d3.select("#lab8-topic-filter")
        .selectAll("option.lab8-data-option")
        .data(topics)
        .join("option")
        .attr("class", "lab8-data-option")
        .attr("value", d => d)
        .text(d => d);

    d3.selectAll("#lab8-search, #lab8-section-filter, #lab8-topic-filter")
        .on("input change", () => {
            state.matrixSelection = null;
            updatePoints();
            updateMatrixSelection();
        });

    d3.select("#lab8-reset").on("click", resetAll);
}

function drawSemanticMap() {
    const width = 900;
    const height = 570;
    const margin = 28;

    const svg = d3.select("#lab8-semantic-map")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("height", height);

    const x = d3.scaleLinear()
        .domain(d3.extent(state.data, d => d.x))
        .nice()
        .range([margin, width - margin]);

    const y = d3.scaleLinear()
        .domain(d3.extent(state.data, d => d.y))
        .nice()
        .range([height - margin, margin]);

    const radius = d3.scaleSqrt()
        .domain(d3.extent(state.data, d => d.word_count))
        .range([2.5, 7]);

    const topics = Array.from(new Set(state.data.map(d => d.cluster_name))).sort(d3.ascending);
    const color = d3.scaleOrdinal(topics, d3.schemeTableau10);

    state.xScale = x;
    state.yScale = y;
    state.radiusScale = radius;
    state.colorScale = color;

    const zoomLayer = svg.append("g").attr("class", "lab8-zoom-layer");
    state.zoomLayer = zoomLayer;

    const points = zoomLayer.selectAll("circle")
        .data(state.data, d => d.passage_id)
        .join("circle")
        .attr("class", "lab8-map-point")
        .attr("cx", d => x(d.x))
        .attr("cy", d => y(d.y))
        .attr("r", d => radius(d.word_count))
        .attr("fill", d => color(d.cluster_name))
        .on("mouseenter", (event, d) => showTooltip(
            event,
            `<strong>${escapeHtml(d.cluster_name)}</strong><br>` +
            `${escapeHtml(d.section)} · p. ${d.page}<br>${escapeHtml(truncate(d.text, 150))}`
        ))
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .on("click", (event, d) => {
            event.stopPropagation();
            selectPassage(d);
        });

    state.pointSelection = points;

    const zoom = d3.zoom()
        .scaleExtent([0.7, 12])
        .on("zoom", event => zoomLayer.attr("transform", event.transform));

    state.zoomBehavior = zoom;
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", () => clearPassageSelection());

    drawTopicLegend(topics);
    updatePoints();
}

function drawTopicLegend(topics) {
    d3.select("#lab8-topic-legend")
        .selectAll("span.lab8-legend-item")
        .data(topics)
        .join("span")
        .attr("class", "lab8-legend-item")
        .html(d =>
            `<span class="lab8-legend-swatch" style="background:${state.colorScale(d)}"></span>` +
            escapeHtml(d)
        );
}

function activeFilters() {
    return {
        query: d3.select("#lab8-search").property("value").toLowerCase().trim(),
        section: d3.select("#lab8-section-filter").property("value"),
        topic: d3.select("#lab8-topic-filter").property("value")
    };
}

function matchesFilters(d) {
    const f = activeFilters();
    const haystack = `${d.text} ${d.chapter} ${d.section} ${d.subsection}`.toLowerCase();

    return (!f.query || haystack.includes(f.query)) &&
        (f.section === "all" || d.section === f.section) &&
        (f.topic === "all" || d.cluster_name === f.topic);
}

function updatePoints() {
    if (!state.pointSelection) return;

    const selected = state.selectedId ? state.data.find(d => d.passage_id === state.selectedId) : null;
    const neighborSet = new Set(selected?.neighbors || []);

    state.pointSelection
        .classed("lab8-muted", d => !matchesFilters(d))
        .classed("lab8-selected", d => d.passage_id === state.selectedId)
        .classed("lab8-neighbor", d => neighborSet.has(d.passage_id));
}

function selectPassage(d) {
    state.selectedId = d.passage_id;
    state.matrixSelection = { section: d.section, topic: d.cluster_name };
    updatePoints();
    renderDetails(d);
    updateMatrixSelection();
}

function clearPassageSelection() {
    state.selectedId = null;
    state.matrixSelection = null;
    updatePoints();
    updateMatrixSelection();
}

function renderDetails(d) {
    const byId = new Map(state.data.map(row => [row.passage_id, row]));
    const neighbors = d.neighbors.map(id => byId.get(id)).filter(Boolean);

    d3.select("#lab8-detail-panel").html(`
        <h3>${escapeHtml(d.subsection || d.section)}</h3>
        <p class="lab8-detail-meta">
            <strong>Chapter:</strong> ${escapeHtml(d.chapter)}<br>
            <strong>Section:</strong> ${escapeHtml(d.section)}<br>
            <strong>Subsection:</strong> ${escapeHtml(d.subsection || "—")}<br>
            <strong>Page:</strong> ${d.page}<br>
            <strong>Semantic topic:</strong> ${escapeHtml(d.cluster_name)}<br>
            <strong>Passage length:</strong> ${d.word_count} words
        </p>
        <p>${escapeHtml(d.text)}</p>
        <h4>Five nearest semantic neighbors</h4>
        <ol class="lab8-neighbor-list">
            ${neighbors.map(n => `
                <li>
                    <strong>${escapeHtml(n.section)} · p. ${n.page}</strong><br>
                    ${escapeHtml(truncate(n.text, 190))}
                </li>
            `).join("")}
        </ol>
    `);
}

function resetAll() {
    d3.select("#lab8-search").property("value", "");
    d3.select("#lab8-section-filter").property("value", "all");
    d3.select("#lab8-topic-filter").property("value", "all");
    state.selectedId = null;
    state.matrixSelection = null;

    d3.select("#lab8-detail-panel").html(
        "<h3>Passage Details</h3><p>Click a point to inspect its passage and five nearest semantic neighbors.</p>"
    );

    d3.select("#lab8-semantic-map")
        .transition()
        .duration(350)
        .call(state.zoomBehavior.transform, d3.zoomIdentity);

    updatePoints();
    updateMatrixSelection();
}


// Topic x section matrix
function drawMatrix() {
    const sections = Array.from(new Set(state.data.map(d => d.section))).sort(d3.ascending);
    const topics = Array.from(new Set(state.data.map(d => d.cluster_name))).sort(d3.ascending);

    const countMap = new Map(
        state.matrix.map(d => [`${d.section}|||${d.cluster_name}`, d])
    );

    const cells = [];
    sections.forEach(section => {
        topics.forEach(topic => {
            const existing = countMap.get(`${section}|||${topic}`);
            cells.push({
                section,
                cluster_name: topic,
                count: existing?.count || 0,
                proportion: existing?.proportion || 0
            });
        });
    });

    const cellWidth = 80;
    const cellHeight = 20;
    const margin = { top: 180, right: 20, bottom: 20, left: 280 };
    const width = margin.left + topics.length * cellWidth + margin.right;
    const height = margin.top + sections.length * cellHeight + margin.bottom;

    const svg = d3.select("#lab8-matrix")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

    const x = d3.scaleBand()
        .domain(topics)
        .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
        .domain(sections)
        .range([margin.top, height - margin.bottom]);

    const maxCount = d3.max(cells, d => d.count) || 1;

    const intensity = d3.scaleSequential()
        .domain([1, maxCount])
        .interpolator(t => d3.interpolateBlues(0.3 + 0.7 * t));

    // Matrix color legend
    const legendX = 20;
    const legendY = 35;
    const legendWidth = 180;
    const legendHeight = 14;

    const legendGroup = svg.append("g")
        .attr("class", "lab8-matrix-legend")
        .attr("transform", `translate(${legendX}, ${legendY})`);

    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", -10)
        .attr("font-size", 12)
        .attr("font-weight", 600)
        .text("Passages per cell");

    // Create small rectangles to form the gradient
    const legendSteps = 50;

    legendGroup.selectAll(".lab8-matrix-legend-step")
        .data(d3.range(legendSteps))
        .join("rect")
        .attr("class", "lab8-matrix-legend-step")
        .attr("x", d => d * (legendWidth / legendSteps))
        .attr("y", 0)
        .attr("width", legendWidth / legendSteps + 0.5)
        .attr("height", legendHeight)
        .attr("fill", d => {
            const t = d / (legendSteps - 1);
            const value = 1 + t * (maxCount - 1);
            return intensity(value);
        });

    // Minimum label
    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", legendHeight + 15)
        .attr("font-size", 11)
        .attr("text-anchor", "start")
        .text("1");

    // Maximum label
    legendGroup.append("text")
        .attr("x", legendWidth)
        .attr("y", legendHeight + 15)
        .attr("font-size", 11)
        .attr("text-anchor", "end")
        .text(maxCount);

    // Explain empty cells
    legendGroup.append("rect")
        .attr("x", legendWidth + 35)
        .attr("y", 0)
        .attr("width", legendHeight)
        .attr("height", legendHeight)
        .attr("fill", "#f7f7f7")
        .attr("stroke", "#ccc");

    legendGroup.append("text")
        .attr("x", legendWidth + 55)
        .attr("y", legendHeight - 2)
        .attr("font-size", 11)
        .text("0 passages");

    svg.selectAll(".lab8-matrix-row-label")
        .data(sections)
        .join("text")
        .attr("class", "lab8-matrix-row-label lab8-chart-label")
        .attr("x", margin.left - 8)
        .attr("y", d => y(d) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .text(d => truncate(d, 42));

    svg.selectAll(".lab8-matrix-col-label")
        .data(topics)
        .join("text")
        .attr("class", "lab8-matrix-col-label lab8-chart-label")
        .attr("transform", d => `translate(${x(d) + x.bandwidth() / 2},${margin.top - 8}) rotate(-55)`)
        .attr("text-anchor", "start")
        .text(d => d);

    const cellSelection = svg.selectAll("rect.lab8-matrix-cell")
        .data(cells, d => `${d.section}|||${d.cluster_name}`)
        .join("rect")
        .attr("class", "lab8-matrix-cell")
        .attr("x", d => x(d.cluster_name))
        .attr("y", d => y(d.section))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("fill", d => d.count === 0 ? "#f7f7f7" : intensity(d.count))
        .on("mouseenter", (event, d) => showTooltip(
            event,
            `<strong>${escapeHtml(d.section)}</strong><br>` +
            `Topic: ${escapeHtml(d.cluster_name)}<br>` +
            `Passages: ${d.count}<br>` +
            `Section proportion: ${(d.proportion * 100).toFixed(1)}%`
        ))
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .on("click", (event, d) => {
            if (d.count === 0) return;
            event.stopPropagation();
            state.matrixSelection = { section: d.section, topic: d.cluster_name };
            state.selectedId = null;
            d3.select("#lab8-section-filter").property("value", d.section);
            d3.select("#lab8-topic-filter").property("value", d.cluster_name);
            updatePoints();
            updateMatrixSelection();
        });

    state.matrixCellSelection = cellSelection;
    updateMatrixSelection();
}

function updateMatrixSelection() {
    if (!state.matrixCellSelection) return;

    state.matrixCellSelection.classed("lab8-cell-selected", d => {
        if (!state.matrixSelection) return false;
        return d.section === state.matrixSelection.section &&
            d.cluster_name === state.matrixSelection.topic;
    });
}


// Tooltip
function showTooltip(event, html) {
    d3.select("#lab8-tooltip")
        .html(html)
        .style("opacity", 1)
        .attr("aria-hidden", "false");
    moveTooltip(event);
}

function moveTooltip(event) {
    d3.select("#lab8-tooltip")
        .style("left", `${event.clientX + 14}px`)
        .style("top", `${event.clientY + 14}px`);
}

function hideTooltip() {
    d3.select("#lab8-tooltip")
        .style("opacity", 0)
        .attr("aria-hidden", "true");
}
