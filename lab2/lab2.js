const width = 900;
const height = 650;

const margin = {
    top: 90,
    right: 190,
    bottom: 70,
    left: 110
};

const tooltip = d3.select("#tooltip");

// Load the assignment dataset and convert numeric columns to numbers.
d3.csv("../data/cities_multivariate.csv", d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
}))
.then(data => {
    // Order cities by development level, then by temperature within each level.
    const developmentOrder = {
        High: 0,
        Medium: 1,
        Low: 2
    };

    data.sort((a, b) =>
        developmentOrder[a.development_level] - developmentOrder[b.development_level] ||
        a.temp_c - b.temp_c
    );

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("aria-label", "Multivariate city visualization");

    // Population is represented by horizontal bar length.
    const populationScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.population)])
        .nice()
        .range([margin.left, width - margin.right]);

    // Temperature is represented by the horizontal position of each circle.
    const temperatureScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.temp_c))
        .nice()
        .range([margin.left, width - margin.right]);

    // City identifies each row.
    const cityScale = d3.scaleBand()
        .domain(data.map(d => d.city))
        .range([margin.top, height - margin.bottom])
        .padding(0.28);

    // Region is nominal, so it is represented with categorical color.
    const regions = Array.from(new Set(data.map(d => d.region)));

    const colorScale = d3.scaleOrdinal()
        .domain(regions)
        .range(d3.schemeTableau10);

    // Development level is ordinal, so larger circles represent higher levels.
    const sizeScale = d3.scaleOrdinal()
        .domain(["High", "Medium", "Low"])
        .range([13, 9, 5]);

    // Bottom population axis.
    svg.append("g")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(populationScale));

    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 20)
        .attr("text-anchor", "middle")
        .text("Population (millions)");

    // Top temperature axis.
    svg.append("g")
        .attr("transform", `translate(0, ${margin.top - 20})`)
        .call(d3.axisTop(temperatureScale));

    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", 25)
        .attr("text-anchor", "middle")
        .text("Average Temperature (°C)");

    // City labels on the y-axis.
    svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(cityScale).tickSize(0))
        .call(g => g.select(".domain").remove());

    // Population bars.
    svg.selectAll(".population-bar")
        .data(data)
        .join("rect")
        .attr("class", "population-bar")
        .attr("x", populationScale(0))
        .attr("y", d => cityScale(d.city))
        .attr("width", d => populationScale(d.population) - populationScale(0))
        .attr("height", cityScale.bandwidth())
        .attr("fill", d => colorScale(d.region))
        .attr("opacity", 0.72)
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);

    // Temperature circles. Their size also represents development level.
    svg.selectAll(".temperature-point")
        .data(data)
        .join("circle")
        .attr("class", "temperature-point")
        .attr("cx", d => temperatureScale(d.temp_c))
        .attr("cy", d => cityScale(d.city) + cityScale.bandwidth() / 2)
        .attr("r", d => sizeScale(d.development_level))
        .attr("fill", "white")
        .attr("stroke", "#222")
        .attr("stroke-width", 1.5)
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);

    // Region color legend.
    const regionLegend = svg.append("g")
        .attr("transform", `translate(${width - margin.right + 30}, ${margin.top})`);

    regionLegend.append("text")
        .attr("class", "legend-title")
        .attr("x", 0)
        .attr("y", -15)
        .text("Region");

    const regionItems = regionLegend
        .selectAll(".region-item")
        .data(regions)
        .join("g")
        .attr("class", "region-item")
        .attr("transform", (d, i) => `translate(0, ${i * 28})`);

    regionItems.append("rect")
        .attr("width", 16)
        .attr("height", 16)
        .attr("rx", 2)
        .attr("fill", d => colorScale(d));

    regionItems.append("text")
        .attr("x", 24)
        .attr("y", 13)
        .text(d => d);

    // Development-level size legend.
    const developmentLevels = ["High", "Medium", "Low"];

    const developmentLegend = svg.append("g")
        .attr("transform", `translate(${width - margin.right + 30}, ${margin.top + 155})`);

    developmentLegend.append("text")
        .attr("class", "legend-title")
        .attr("x", 0)
        .attr("y", -15)
        .text("Development Level");

    const developmentItems = developmentLegend
        .selectAll(".development-item")
        .data(developmentLevels)
        .join("g")
        .attr("class", "development-item")
        .attr("transform", (d, i) => `translate(0, ${i * 36})`);

    developmentItems.append("circle")
        .attr("cx", 10)
        .attr("cy", 10)
        .attr("r", d => sizeScale(d))
        .attr("fill", "white")
        .attr("stroke", "#222")
        .attr("stroke-width", 1.5);

    developmentItems.append("text")
        .attr("x", 28)
        .attr("y", 14)
        .text(d => d);

    function showTooltip(event, d) {
        tooltip
            .style("opacity", 1)
            .html(`
                <strong>${d.city}</strong><br>
                Population: ${d.population} million<br>
                Temperature: ${d.temp_c}°C<br>
                Development: ${d.development_level}<br>
                Region: ${d.region}
            `);
    }

    function moveTooltip(event) {
        tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
    }

    function hideTooltip() {
        tooltip.style("opacity", 0);
    }
})
.catch(error => {
    console.error("Error loading the city data:", error);
});
