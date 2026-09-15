const treemapWidth = 920;
const treemapHeight = 620;

const statusDomain = ["Increase", "Unchanged", "Decrease"];
const statusColors = new Map([
    ["Increase", "#4C78A8"],
    ["Unchanged", "#BAB0AC"],
    ["Decrease", "#F58518"]
]);

const gdpFormat = d3.format(",.0f");
const tooltip = d3.select("#lab6-tooltip");

renderLegend();

d3.json("../data/lab6_assignment_gdp.json")
    .then(data => {
        drawTreemap({
            selector: "#treemap-squarify",
            data,
            tileMethod: d3.treemapSquarify,
            accessibleName: "GDP treemap using the Squarify segmentation method"
        });

        drawTreemap({
            selector: "#treemap-slicedice",
            data,
            tileMethod: d3.treemapSliceDice,
            accessibleName: "GDP treemap using the Slice-Dice segmentation method"
        });
    })
    .catch(error => {
        console.error("Unable to load the hierarchical GDP JSON:", error);

        d3.selectAll(".lab6-chart")
            .append("p")
            .attr("class", "lab6-error")
            .text("The GDP hierarchy could not be loaded. Run convert_hierarchy.py and serve the project through a local or GitHub Pages web server.");
    });


function renderLegend() {
    const legendItems = d3.select("#status-legend")
        .selectAll(".lab6-legend-item")
        .data(statusDomain)
        .join("div")
        .attr("class", "lab6-legend-item");

    legendItems.append("span")
        .attr("class", "lab6-legend-swatch")
        .style("background-color", status => statusColors.get(status));

    legendItems.append("span")
        .text(status => status);
}


function drawTreemap({ selector, data, tileMethod, accessibleName }) {
    const root = d3.hierarchy(data)
        .sum(d => d.gdp || 0)
        .sort((a, b) => b.value - a.value);

    const layout = d3.treemap()
        .tile(tileMethod)
        .size([treemapWidth, treemapHeight])
        .paddingOuter(3)
        .paddingInner(1.5)
        .paddingTop(d => {
            if (d.depth === 1) return 25;
            if (d.depth === 2) return 19;
            return 0;
        })
        .round(true);

    layout(root);

    const svg = d3.select(selector)
        .append("svg")
        .attr("class", "lab6-treemap-svg")
        .attr("viewBox", `0 0 ${treemapWidth} ${treemapHeight}`)
        .attr("role", "img")
        .attr("aria-label", accessibleName);

    drawCountryCells(svg, root.leaves());
    drawAreaBoundaries(svg, root.descendants().filter(d => d.depth === 2));
    drawContinentBoundaries(svg, root.descendants().filter(d => d.depth === 1));
}


function drawCountryCells(svg, leaves) {
    const cells = svg.append("g")
        .attr("class", "lab6-country-layer")
        .selectAll("g")
        .data(leaves)
        .join("g")
        .attr("class", "lab6-country-cell")
        .attr("transform", d => `translate(${d.x0},${d.y0})`);

    cells.append("rect")
        .attr("class", "lab6-country-rect")
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("fill", d => statusColors.get(d.data.status) || "#cccccc");

    // Avoid clutter: only draw text when the cell has enough room.
    cells.filter(d => (d.x1 - d.x0) >= 48 && (d.y1 - d.y0) >= 28)
        .append("text")
        .attr("class", "lab6-country-label")
        .attr("x", 6)
        .attr("y", 15)
        .text(d => d.data.name);

    cells.filter(d => (d.x1 - d.x0) >= 48 && (d.y1 - d.y0) >= 28)
        .append("text")
        .attr("class", "lab6-country-value")
        .attr("x", 6)
        .attr("y", 31)
        .text(d => `$${gdpFormat(d.data.gdp)}B`);

    cells
        .on("pointerenter", function(event, d) {
            const area = d.parent?.data.name || "—";
            const continent = d.parent?.parent?.data.name || "—";

            tooltip
                .attr("aria-hidden", "false")
                .style("opacity", 1)
                .html(`
                    <strong class="lab6-tooltip-title">${escapeHtml(d.data.name)}</strong>
                    <div><strong>Continent:</strong> ${escapeHtml(continent)}</div>
                    <div><strong>Area:</strong> ${escapeHtml(area)}</div>
                    <div><strong>GDP:</strong> $${gdpFormat(d.data.gdp)} billion</div>
                    <div><strong>GDP status:</strong> ${escapeHtml(d.data.status)}</div>
                `);

            positionTooltip(event);
        })
        .on("pointermove", positionTooltip)
        .on("pointerleave", function() {
            tooltip
                .attr("aria-hidden", "true")
                .style("opacity", 0);
        });
}


function drawAreaBoundaries(svg, areas) {
    const groups = svg.append("g")
        .attr("class", "lab6-area-layer")
        .selectAll("g")
        .data(areas)
        .join("g");

    groups.append("rect")
        .attr("class", "lab6-area-boundary")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0));

    const labels = groups
        .filter(d =>
            (d.x1 - d.x0) >= 45 &&
            (d.y1 - d.y0) >= 22
        )
        .append("text")
        .attr("class", "lab6-area-label")
        .attr("x", d => d.x0 + 5)
        .attr("y", d => d.y0 + 13);

    labels.each(function(d) {
        wrapLabel(
            d3.select(this),
            d.data.name,
            d.x1 - d.x0 - 10,
            2
        );
    });
}


function drawContinentBoundaries(svg, continents) {
    const groups = svg.append("g")
        .attr("class", "lab6-continent-layer")
        .selectAll("g")
        .data(continents)
        .join("g");

    groups.append("rect")
        .attr("class", "lab6-continent-boundary")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0));

    const labels = groups
        .filter(d =>
            (d.x1 - d.x0) >= 45 &&
            (d.y1 - d.y0) >= 25
        )
        .append("text")
        .attr("class", "lab6-continent-label")
        .attr("x", d => d.x0 + 6)
        .attr("y", d => d.y0 + 16);

    labels.each(function(d) {
        wrapLabel(
            d3.select(this),
            d.data.name,
            d.x1 - d.x0 - 12,
            2
        );
    });
}


function positionTooltip(event) {
    const page = document.querySelector(".lab6-page");
    const pageRect = page.getBoundingClientRect();

    const left = event.clientX - pageRect.left + 14;
    const top = event.clientY - pageRect.top + 14;

    tooltip
        .style("left", `${left}px`)
        .style("top", `${top}px`);
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function wrapLabel(textSelection, label, maxWidth, maxLines = 2) {
    const words = label.split(/\s+/);

    let line = [];
    let lineNumber = 0;

    const x = +textSelection.attr("x");
    const y = +textSelection.attr("y");

    textSelection.text(null);

    let tspan = textSelection
        .append("tspan")
        .attr("x", x)
        .attr("y", y);

    for (let i = 0; i < words.length; i++) {
        line.push(words[i]);
        tspan.text(line.join(" "));

        if (tspan.node().getComputedTextLength() > maxWidth) {
            line.pop();
            tspan.text(line.join(" "));

            line = [words[i]];
            lineNumber++;

            if (lineNumber >= maxLines) {
                let current = tspan.text();

                while (
                    tspan.node().getComputedTextLength() > maxWidth - 8 &&
                    current.length > 1
                ) {
                    current = current.slice(0, -1);
                    tspan.text(current + "…");
                }

                return;
            }

            tspan = textSelection
                .append("tspan")
                .attr("x", x)
                .attr("y", y)
                .attr("dy", `${lineNumber * 12}px`)
                .text(words[i]);
        }
    }
}