const stationFile = "../data/lab5_assignment_stations.csv";
const routeFile = "../data/lab5_assignment_routes.csv";

const networkWidth = 1100;
const networkHeight = 700;
const tooltip = d3.select("#tooltip");

const districtOrder = ["Central", "North", "South", "East", "West"];
const districtColors = new Map([
    ["Central", "#4e79a7"],
    ["North", "#f28e2b"],
    ["South", "#59a14f"],
    ["East", "#e15759"],
    ["West", "#b07aa1"]
]);


const stationSymbols = new Map([
    ["Local", d3.symbolCircle],
    ["Transfer", d3.symbolSquare],
    ["Terminal", d3.symbolTriangle]
]);

Promise.all([
    d3.csv(stationFile, d => ({
        id: d.id,
        station_name: d.station_name,
        district: d.district,
        daily_passengers: +d.daily_passengers,
        station_type: d.station_type
    })),
    d3.csv(routeFile, d => ({
        source: d.source,
        target: d.target,
        travel_time_min: +d.travel_time_min,
        route_type: d.route_type
    }))
])
.then(([stations, routes]) => {

    const passengerExtent = d3.extent(stations, d => d.daily_passengers);
    const travelExtent = d3.extent(routes, d => d.travel_time_min);

    const nodeAreaScale = d3.scaleLinear()
        .domain(passengerExtent)
        .range([60, 800]);

    const linkWidthScale = d3.scaleLinear()
        .domain(travelExtent)
        .range([1.2, 6]);

    const matrixOpacityScale = d3.scaleLinear()
        .domain(travelExtent)
        .range([0.35, 1]);

    drawLegends(stations, routes, nodeAreaScale, linkWidthScale, travelExtent);
    const network = drawNetwork(stations, routes, nodeAreaScale, linkWidthScale);
    drawMatrix(stations, routes, nodeAreaScale, matrixOpacityScale);

    d3.select("#reset-network").on("click", () => {
        stations.forEach(d => {
            d.fx = null;
            d.fy = null;
        });
        network.alpha(1).restart();
    });
});

function districtColor(district) {
    return districtColors.get(district) || "#7f8c8d";
}


function stationSymbol(stationType) {
    return stationSymbols.get(stationType) || d3.symbolCircle;
}

function endpointId(endpoint) {
    return typeof endpoint === "object" ? endpoint.id : endpoint;
}

function drawLegends(stations, routes, nodeAreaScale, linkWidthScale, travelExtent) {
    const districts = orderedUnique(stations.map(d => d.district), districtOrder);
    const stationTypes = orderedUnique(stations.map(d => d.station_type), ["Local", "Transfer", "Terminal"]);
    const routeTypes = orderedUnique(routes.map(d => d.route_type), ["Metro", "Express", "Shuttle"]);

    const passengerValues = [
        d3.min(stations, d => d.daily_passengers),
        d3.median(stations, d => d.daily_passengers),
        d3.max(stations, d => d.daily_passengers)
    ];

    const travelValues = [5, 10, 15];

    const networkLegend = d3.select("#network-legend");
    networkLegend.html("");

    addColorLegend(networkLegend, "District", districts, districtColor);
    addSymbolLegend(networkLegend, "Station type", stationTypes);
    addSizeLegend(networkLegend, "Daily passengers", passengerValues, nodeAreaScale);
    addRouteTypeLegend(networkLegend, "Route type", routeTypes);
    addLineLegend(networkLegend, "Travel time", travelValues, () => "#7c8793", linkWidthScale, d => `${Math.round(d)} min`);

    const matrixLegend = d3.select("#matrix-legend");
    matrixLegend.html("");
    addColorLegend(
        matrixLegend, 
        "District", 
        districts, 
        districtColor);

    addSymbolLegend(
        matrixLegend,
        "Station type",
        stationTypes
    );

    addMatrixRouteLegend(
        matrixLegend,
        "Cell texture = route type",
        routeTypes
    );

    const opacityGroup = matrixLegend.append("div").attr("class", "legend-group");
    opacityGroup.append("span").attr("class", "legend-title").text("Cell opacity = travel time:");
    travelValues.forEach(value => {
        const item = opacityGroup.append("span").attr("class", "legend-item");
        item.append("span")
            .attr("class", "legend-swatch")
            .style("background", "#607d8b")
            .style("opacity", matrixOpacityForLegend(value, travelExtent));
        item.append("span").text(`${value} min`);
    });

    const ordering = matrixLegend.append("div").attr("class", "legend-group");
    ordering.append("span").attr("class", "legend-title").text("Ordering:");
    ordering.append("span").text("district → station type → passenger volume");
}

function orderedUnique(values, preferredOrder) {
    const set = new Set(values);
    return preferredOrder.filter(d => set.has(d)).concat([...set].filter(d => !preferredOrder.includes(d)).sort());
}

function addColorLegend(container, title, values, colorFn) {
    const group = container.append("div").attr("class", "legend-group");
    group.append("span").attr("class", "legend-title").text(`${title}:`);
    values.forEach(value => {
        const item = group.append("span").attr("class", "legend-item");
        item.append("span")
            .attr("class", "legend-swatch")
            .style("background", colorFn(value));
        item.append("span").text(value);
    });
}

function addSymbolLegend(container, title, values) {
    const group = container.append("div").attr("class", "legend-group");
    group.append("span").attr("class", "legend-title").text(`${title}:`);
    values.forEach(value => {
        const item = group.append("span").attr("class", "legend-item");
        const icon = item.append("svg").attr("class", "legend-symbol").attr("viewBox", "-10 -10 20 20");
        icon.append("path")
            .attr("d", d3.symbol().type(stationSymbol(value)).size(95)())
            .attr("fill", "#607d8b");
        item.append("span").text(value);
    });
}

function addSizeLegend(container, title, values, sizeScale) {
    const group = container.append("div").attr("class", "legend-group");
    group.append("span").attr("class", "legend-title").text(`${title}:`);

    values.forEach((value, i) => {
        const item = group.append("span").attr("class", "legend-item");

        const icon = item.append("svg")
            .attr("class", "legend-symbol")
            .attr("viewBox", "-20 -20 40 40");

        icon.append("circle")
            .attr("r", Math.sqrt(sizeScale(value) / Math.PI))
            .attr("fill", "#607d8b");

        let label;

        if (i === 0) {
            const rounded = Math.ceil(value / 500) * 500;
            label = `< ${d3.format(",")(rounded)}`;
        } else if (i === values.length - 1) {
            const rounded = Math.floor(value / 500) * 500;
            label = `> ${d3.format(",")(rounded)}`;
        } else {
            const rounded = Math.round(value / 500) * 500;
            label = `≈ ${d3.format(",")(rounded)}`;
        }

        item.append("span").text(label);
    });
}

function addLineLegend(container, title, values, colorFn, widthFn, labelFn = d => d) {
    const group = container.append("div").attr("class", "legend-group");
    group.append("span").attr("class", "legend-title").text(`${title}:`);
    values.forEach(value => {
        const item = group.append("span").attr("class", "legend-item");
        item.append("span")
            .attr("class", "legend-line")
            .style("border-top-color", colorFn(value))
            .style("border-top-width", `${widthFn(value)}px`);
        item.append("span").text(labelFn(value));
    });
}

function addRouteTypeLegend(container, title, values) {
    const group = container.append("div").attr("class", "legend-group");
    group.append("span").attr("class", "legend-title").text(`${title}:`);

    values.forEach(value => {
        const item = group.append("span").attr("class", "legend-item");
        const icon = item.append("svg")
            .attr("width", 40)
            .attr("height", 14)
            .attr("viewBox", "0 0 40 14");

        icon.append("line")
            .attr("x1", 1)
            .attr("x2", 39)
            .attr("y1", 7)
            .attr("y2", 7)
            .attr("stroke", "#607d8b")
            .attr("stroke-width", 3)
            .attr("stroke-dasharray", routeDash(value))
            .attr("stroke-linecap", "round");

        item.append("span").text(value);
    });
}

function addMatrixRouteLegend(container, title, values) {
    const group = container.append("div").attr("class", "legend-group");
    group.append("span").attr("class", "legend-title").text(`${title}:`);

    values.forEach(value => {
        const item = group.append("span").attr("class", "legend-item");
        const swatch = item.append("span").attr("class", "legend-swatch");

        if (value === "Metro") {
            swatch.style("background", "#607d8b");
        } else if (value === "Express") {
            swatch
                .style("background", "repeating-linear-gradient(135deg, #607d8b 0 4px, #334e68 4px 6px)");
        } else if (value === "Shuttle") {
            swatch
                .style("background-color", "#607d8b")
                .style("background-image", "radial-gradient(circle, #334e68 1.2px, transparent 1.3px)")
                .style("background-size", "6px 6px");
        }

        item.append("span").text(value);
    });
}

function matrixOpacityForLegend(value, travelExtent) {
    return d3.scaleLinear()
        .domain(travelExtent)
        .range([0.35, 1])
        .clamp(true)(value);
}

function routeDash(routeType) {
    if (routeType === "Metro") return null;      // solid
    if (routeType === "Express") return "8,5";   // dashed
    if (routeType === "Shuttle") return "2,4";   // dotted
    return null;
}

function drawNetwork(stations, routes, nodeAreaScale, linkWidthScale) {
    const svg = d3.select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${networkWidth} ${networkHeight}`)
        .attr("width", networkWidth)
        .attr("height", networkHeight)
        .attr("aria-label", "Force-directed transit network");

    const link = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(routes)
        .join("line")
        .attr("class", "link-line")
        .attr("stroke", "#607d8b")
        .attr("stroke-width", d => linkWidthScale(d.travel_time_min))
        .attr("stroke-dasharray", d => routeDash(d.route_type))
        .attr("stroke-linecap", "round")
        .attr("stroke-opacity", 0.7);

    const node = svg.append("g")
        .attr("class", "nodes")
        .selectAll("path")
        .data(stations)
        .join("path")
        .attr("class", "node-path")
        .attr("d", d => d3.symbol()
            .type(stationSymbol(d.station_type))
            .size(nodeAreaScale(d.daily_passengers))())
        .attr("fill", d => districtColor(d.district));

    const label = svg.append("g")
        .attr("class", "labels")
        .selectAll("text")
        .data(stations)
        .join("text")
        .attr("class", "network-label")
        .text(d => d.station_name);

    const simulation = d3.forceSimulation(stations)
        .force("link", d3.forceLink(routes)
            .id(d => d.id)
            .distance(d => 70 + d.travel_time_min * 4)
            .strength(0.55))
        .force("charge", d3.forceManyBody().strength(-260))
        .force("center", d3.forceCenter(networkWidth / 2, networkHeight / 2))
        .force("collision", d3.forceCollide()
            .radius(d => Math.sqrt(nodeAreaScale(d.daily_passengers) / Math.PI) + 12))
        .force("x", d3.forceX(networkWidth / 2).strength(0.03))
        .force("y", d3.forceY(networkHeight / 2).strength(0.03));

    simulation.on("tick", () => {
        stations.forEach(d => {
            d.x = Math.max(35, Math.min(networkWidth - 35, d.x));
            d.y = Math.max(35, Math.min(networkHeight - 35, d.y));
        });

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);

        label
            .attr("x", d =>
                d.x > networkWidth/2 - 80
                    ? d.x - 10
                    : d.x + 10
            )
            .attr("y", d => d.y + 3)
            .attr("text-anchor", d =>
                d.x > networkWidth/2 
                    ? "end"
                    : "start"
            );
    });

    node.call(
        d3.drag()
            .on("start", (event, d) => {
                if (!event.active) simulation.alphaTarget(0.25).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on("end", (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            })
    );

    const neighborSet = new Set(
        routes.flatMap(d => {
            const a = endpointId(d.source);
            const b = endpointId(d.target);
            return [`${a}|${b}`, `${b}|${a}`];
        })
    );

    node
        .on("mouseover.highlight", function(event, d) {
            node.attr("opacity", other =>
                other.id === d.id || neighborSet.has(`${d.id}|${other.id}`) ? 1 : 0.12
            );
            label.attr("opacity", other =>
                other.id === d.id || neighborSet.has(`${d.id}|${other.id}`) ? 1 : 0.08
            );
            link.attr("stroke-opacity", l =>
                endpointId(l.source) === d.id || endpointId(l.target) === d.id ? 1 : 0.06
            );

            showTooltip(event, `
                <strong>${d.station_name}</strong><br>
                District: ${d.district}<br>
                Daily passengers: ${d3.format(",")(d.daily_passengers)}<br>
                Station type: ${d.station_type}
            `);
        })
        .on("mousemove.highlight", moveTooltip)
        .on("mouseout.highlight", () => {
            node.attr("opacity", 1);
            label.attr("opacity", 1);
            link.attr("stroke-opacity", 0.7);
            hideTooltip();
        });

    link
        .on("mouseover.highlight", function(event, d) {
            const sourceId = endpointId(d.source);
            const targetId = endpointId(d.target);
            link.attr("stroke-opacity", l => l === d ? 1 : 0.08);
            node.attr("opacity", n => n.id === sourceId || n.id === targetId ? 1 : 0.12);
            label.attr("opacity", n => n.id === sourceId || n.id === targetId ? 1 : 0.08);
            d3.select(this).attr("stroke-width", linkWidthScale(d.travel_time_min) + 2);

            showTooltip(event, `
                <strong>${d.source.station_name} — ${d.target.station_name}</strong><br>
                Route type: ${d.route_type}<br>
                Travel time: ${d.travel_time_min} min
            `);
        })
        .on("mousemove.highlight", moveTooltip)
        .on("mouseout.highlight", function(event, d) {
            link
                .attr("stroke-opacity", 0.7)
                .attr("stroke-width", l => linkWidthScale(l.travel_time_min));
            node.attr("opacity", 1);
            label.attr("opacity", 1);
            hideTooltip();
        });

    return simulation;
}

function drawMatrix(stations, routes, nodeAreaScale, matrixOpacityScale) {
    const stationById = new Map(stations.map(d => [d.id, d]));
    const typeRank = new Map([["Terminal", 0], ["Transfer", 1], ["Local", 2]]);
    const districtRank = new Map(districtOrder.map((d, i) => [d, i]));

    const orderedStations = [...stations].sort((a, b) =>
        (districtRank.get(a.district) ?? 99) - (districtRank.get(b.district) ?? 99) ||
        (typeRank.get(a.station_type) ?? 99) - (typeRank.get(b.station_type) ?? 99) ||
        d3.descending(a.daily_passengers, b.daily_passengers) ||
        d3.ascending(a.station_name, b.station_name)
    );

    const ids = orderedStations.map(d => d.id);
    const routeByPair = new Map();
    routes.forEach(route => {
        const a = endpointId(route.source);
        const b = endpointId(route.target);
        routeByPair.set(`${a}|${b}`, route);
        routeByPair.set(`${b}|${a}`, route);
    });

    const matrixData = [];
    ids.forEach(row => {
        ids.forEach(col => {
            matrixData.push({ row, col, route: routeByPair.get(`${row}|${col}`) || null });
        });
    });

    const matrixSize = 620;
    const margin = { top: 155, right: 30, bottom: 30, left: 165 };
    const width = margin.left + matrixSize + margin.right;
    const height = margin.top + matrixSize + margin.bottom;

    const svg = d3.select("#matrix")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", width)
        .attr("height", height)
        .attr("aria-label", "Adjacency matrix of the transit network");

    const defs = svg.append("defs");

    const expressPattern = defs.append("pattern")
        .attr("id", "matrix-route-express")
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 6)
        .attr("height", 6);

    expressPattern.append("rect")
        .attr("width", 6)
        .attr("height", 6)
        .attr("fill", "#607d8b");

    expressPattern.append("path")
        .attr("d", "M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5")
        .attr("fill", "none")
        .attr("stroke", "#334e68")
        .attr("stroke-width", 1.4);

    const shuttlePattern = defs.append("pattern")
        .attr("id", "matrix-route-shuttle")
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 6)
        .attr("height", 6);

    shuttlePattern.append("rect")
        .attr("width", 6)
        .attr("height", 6)
        .attr("fill", "#607d8b");

    shuttlePattern.append("circle")
        .attr("cx", 1.5)
        .attr("cy", 1.5)
        .attr("r", 1.1)
        .attr("fill", "#334e68");

    shuttlePattern.append("circle")
        .attr("cx", 4.5)
        .attr("cy", 4.5)
        .attr("r", 1.1)
        .attr("fill", "#334e68");

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(ids).range([0, matrixSize]).paddingInner(0.035);
    const y = d3.scaleBand().domain(ids).range([0, matrixSize]).paddingInner(0.035);

    const cells = g.selectAll("rect.matrix-cell")
        .data(matrixData)
        .join("rect")
        .attr("class", "matrix-cell")
        .attr("x", d => x(d.col))
        .attr("y", d => y(d.row))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("fill", d => {
            if (!d.route) return "#f1f4f6";
            if (d.route.route_type === "Express") return "url(#matrix-route-express)";
            if (d.route.route_type === "Shuttle") return "url(#matrix-route-shuttle)";
            return "#607d8b";
        })
        .attr("fill-opacity", d => d.route ? matrixOpacityScale(d.route.travel_time_min) : 1)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.25);

    const rowLabels = g.append("g")
        .selectAll("text")
        .data(orderedStations)
        .join("text")
        .attr("class", "matrix-label row-label")
        .attr("x", -26)
        .attr("y", d => y(d.id) + y.bandwidth() / 2)
        .attr("dy", "0.32em")
        .attr("text-anchor", "end")
        .attr("fill", d => districtColor(d.district))
        .attr("font-weight", d => d.station_type === "Local" ? 400 : 700)
        .text(d => d.station_name);

    const colLabels = g.append("g")
        .selectAll("text")
        .data(orderedStations)
        .join("text")
        .attr("class", "matrix-label col-label")
        .attr("transform", d => `translate(${x(d.id) + x.bandwidth() / 2},-28) rotate(-62)`)
        .attr("text-anchor", "start")
        .attr("fill", d => districtColor(d.district))
        .attr("font-weight", d => d.station_type === "Local" ? 400 : 700)
        .text(d => d.station_name);

    const matrixNodeArea = d3.scaleLinear()
        .domain(d3.extent(stations, d => d.daily_passengers))
        .range([18, 110]);

    g.append("g")
        .selectAll("path.row-glyph")
        .data(orderedStations)
        .join("path")
        .attr("class", "row-glyph")
        .attr("d", d => d3.symbol().type(stationSymbol(d.station_type)).size(matrixNodeArea(d.daily_passengers))())
        .attr("transform", d => `translate(${-14},${y(d.id) + y.bandwidth() / 2})`)
        .attr("fill", d => districtColor(d.district));

    g.append("g")
        .selectAll("path.col-glyph")
        .data(orderedStations)
        .join("path")
        .attr("class", "col-glyph")
        .attr("d", d => d3.symbol().type(stationSymbol(d.station_type)).size(matrixNodeArea(d.daily_passengers))())
        .attr("transform", d => `translate(${x(d.id) + x.bandwidth() / 2},${-14})`)
        .attr("fill", d => districtColor(d.district));

    const rowGuide = g.append("rect")
        .attr("class", "matrix-guide")
        .attr("fill", "none")
        .attr("stroke", "#1f2933")
        .attr("stroke-width", 1.3)
        .attr("visibility", "hidden");

    const colGuide = g.append("rect")
        .attr("class", "matrix-guide")
        .attr("fill", "none")
        .attr("stroke", "#1f2933")
        .attr("stroke-width", 1.3)
        .attr("visibility", "hidden");

    cells
        .on("mouseover", function(event, d) {
            rowGuide
                .attr("x", 0)
                .attr("y", y(d.row))
                .attr("width", matrixSize)
                .attr("height", y.bandwidth())
                .attr("visibility", "visible");

            colGuide
                .attr("x", x(d.col))
                .attr("y", 0)
                .attr("width", x.bandwidth())
                .attr("height", matrixSize)
                .attr("visibility", "visible");

            rowLabels.attr("opacity", s => s.id === d.row ? 1 : 0.35);
            colLabels.attr("opacity", s => s.id === d.col ? 1 : 0.35);

            const rowStation = stationById.get(d.row);
            const colStation = stationById.get(d.col);
            const routeText = d.route
                ? `${d.route.route_type}, ${d.route.travel_time_min} min`
                : "No direct connection";

            showTooltip(event, `
                <strong>${rowStation.station_name} × ${colStation.station_name}</strong><br>
                ${routeText}
            `);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", () => {
            rowGuide.attr("visibility", "hidden");
            colGuide.attr("visibility", "hidden");
            rowLabels.attr("opacity", 1);
            colLabels.attr("opacity", 1);
            hideTooltip();
        });
}

function showTooltip(event, html) {
    tooltip
        .style("opacity", 1)
        .attr("aria-hidden", "false")
        .html(html);
    moveTooltip(event);
}

function moveTooltip(event) {
    tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
}

function hideTooltip() {
    tooltip.style("opacity", 0).attr("aria-hidden", "true");
}
