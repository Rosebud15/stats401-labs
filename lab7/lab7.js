document.addEventListener("DOMContentLoaded", () => {
    const networkWidth = 1000;
    const networkHeight = 560;
    const timelineWidth = 1000;
    const timelineHeight = 150;

    const svg = d3.select("#lab7-network-svg")
        .attr("viewBox", [0, 0, networkWidth, networkHeight])
        .attr("preserveAspectRatio", "xMidYMid meet");

    const timelineSvg = d3.select("#lab7-volume-chart")
        .attr("viewBox", [0, 0, timelineWidth, timelineHeight])
        .attr("preserveAspectRatio", "xMidYMid meet");

    const tooltip = d3.select("#tooltip");
    const vizContainer = d3.select(".lab7-viz-container");

    // Color scales
    const sectorColorScale = d3.scaleOrdinal()
        .domain([
            "Manufacturing",
            "Logistics",
            "Retail",
            "Food",
            "Technology",
            "Wholesale",
            "Materials"
        ])
        .range([
            "#4e79a7",
            "#f28e2c",
            "#e15759",
            "#76b7b2",
            "#59a14f",
            "#edc949",
            "#af7aa1"
        ])
        .unknown("#9aa0a6");

    const preferredRegionOrder = [
        "Asia",
        "Europe",
        "North America"
    ];

    const regionTint = [
        "#f6fbf7",
        "#f7f9fd",
        "#fff8f4",
        "#faf7fc",
        "#f7fbfb"
    ];

    // Data/state variables
    let companiesData = [];
    let transactionsData = [];
    let transactionsByDay = new Map();
    let companyById = new Map();
    let dailySummary = [];
    let regions = [];

    let currentDay = 1;
    let timer = null;

    let nodeRadiusScale;
    let linkWidthScale;
    let linkOpacityScale;
    let xTimeline;
    let yTimeline;

    // SVG definitions
    const defs = svg.append("defs");

    // Arrowhead used to show transaction direction.
    defs.append("marker")
        .attr("id", "lab7-arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 8)
        .attr("refY", 0)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .attr("markerUnits", "strokeWidth")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "context-stroke");

    // Load data
    Promise.all([
        d3.csv("../data/lab7_assignment_companies.csv"),

        d3.csv(
            "../data/lab7_assignment_transactions_60days.csv",
            d => ({
                date: d.date,
                day: +d.day,
                source: d.source,
                target: d.target,
                amount_usd: +d.amount_usd,
                transaction_type: d.transaction_type,
                transaction_count: +d.transaction_count
            })
        )
    ])
    .then(([companies, transactions]) => {

        // Clean company data.
        companiesData = companies.map(d => ({
            id: d.id,
            company_name: d.company_name,
            sector: d.sector,
            region: d.region
        }));

        companyById = new Map(
            companiesData.map(d => [d.id, d])
        );

        // Clean transaction data.
        transactionsData = transactions
            .filter(
                d =>
                    Number.isFinite(d.day) &&
                    Number.isFinite(d.amount_usd)
            )
            .map((d, i) => ({
                ...d,
                _rowKey:
                    `${d.day}-${d.source}-${d.target}-${d.transaction_type}-${i}`
            }));

        // Group transactions by day.
        transactionsByDay = d3.group(
            transactionsData,
            d => d.day
        );

        // Determine region order.
        regions = Array.from(
            new Set(
                companiesData.map(d => d.region)
            )
        )
        .sort((a, b) => {
            const ai = preferredRegionOrder.indexOf(a);
            const bi = preferredRegionOrder.indexOf(b);

            if (ai === -1 && bi === -1) {
                return d3.ascending(a, b);
            }

            if (ai === -1) return 1;
            if (bi === -1) return -1;

            return ai - bi;
        });

        // Initialize visualization
        initializeForceLayout();
        buildScales();
        buildLegend();
        drawRegionStructure();
        drawNodes();
        drawTimeline();
        setupControls();

        showDay(1, false);
    })
    .catch(err => {
        console.error(
            "Error loading Lab 7 CSV datasets:",
            err
        );

        d3.select(".lab7-viz-container")
            .append("div")
            .attr("class", "lab7-error")
            .text(
                "The visualization data could not be loaded. " +
                "Check the console and CSV paths."
            );
    });

    // Force-directed node layout
    function initializeForceLayout() {

        const regionX = d3.scalePoint()
            .domain(regions)
            .range([
                150,
                networkWidth - 150
            ]);

        // Give each company an initial vertical target.
        regions.forEach(region => {

            const members = companiesData
                .filter(d => d.region === region)
                .sort(
                    (a, b) =>
                        d3.ascending(
                            a.company_name,
                            b.company_name
                        )
                );

            const verticalPosition = d3.scalePoint()
                .domain(
                    members.map(d => d.id)
                )
                .range([
                    115,
                    networkHeight - 70
                ])
                .padding(0.45);

            members.forEach(d => {

                d.x = regionX(region);

                d.y = verticalPosition(
                    d.id
                );

                // Save the desired vertical position.
                d.targetY = verticalPosition(
                    d.id
                );
            });
        });

        // D3 Force Simulation
        const simulation = d3.forceSimulation(
            companiesData
        )

            // Pull nodes toward the column for their region.
            .force(
                "x",
                d3.forceX(
                    d => regionX(d.region)
                )
                .strength(0.8)
            )

            // Keep each company near its assigned vertical position.
            .force(
                "y",
                d3.forceY(
                    d => d.targetY
                )
                .strength(0.35)
            )

            // Push nodes apart.
            .force(
                "charge",
                d3.forceManyBody()
                    .strength(-110)
            )

            // Prevent node overlap.
            .force(
                "collision",
                d3.forceCollide()
                    .radius(38)
                    .strength(1)
                    .iterations(2)
            )

            // Calculate the layout immediately rather than
            // animating the simulation continuously.
            .stop();

        // Run the simulation enough times to stabilize positions.
        for (let i = 0; i < 250; i++) {
            simulation.tick();
        }

        // Keep all nodes within the visible SVG.
        companiesData.forEach(d => {

            d.x = Math.max(
                70,
                Math.min(
                    networkWidth - 70,
                    d.x
                )
            );

            d.y = Math.max(
                90,
                Math.min(
                    networkHeight - 80,
                    d.y
                )
            );
        });
    }

    // Build scales
    function buildScales() {

        // Link width and opacity
        const amountExtent = d3.extent(
            transactionsData,
            d => d.amount_usd
        );

        const safeAmountExtent =
            amountExtent[0] === amountExtent[1]
                ? [
                    0,
                    amountExtent[1] || 1
                ]
                : amountExtent;

        linkWidthScale = d3.scaleSqrt()
            .domain(safeAmountExtent)
            .range([
                1.6,
                8
            ]);

        linkOpacityScale = d3.scaleLinear()
            .domain([1, d3.max(transactionsData, d => d.transaction_count)])
            .range([0.25, 0.9])
            .clamp(true);

        // Node size
        const companyDailyVolumes = [];

        for (
            let day = 1;
            day <= 60;
            day++
        ) {

            const dayTx =
                transactionsByDay.get(day) || [];

            companiesData.forEach(company => {

                companyDailyVolumes.push(
                    calculateCompanyVolume(
                        company.id,
                        dayTx
                    )
                );
            });
        }

        const maxCompanyVolume =
            d3.max(companyDailyVolumes) || 1;

        nodeRadiusScale = d3.scaleSqrt()
            .domain([
                0,
                maxCompanyVolume
            ])
            .range([
                10,
                29
            ]);

        // Daily summary data
        dailySummary = d3.range(
            1,
            61
        )
        .map(day => {

            const tx =
                transactionsByDay.get(day) || [];

            return {
                day: day,

                date:
                    tx[0]?.date || "",

                totalValue:
                    d3.sum(
                        tx,
                        d => d.amount_usd
                    ),

                transactionCount:
                    d3.sum(
                        tx,
                        d =>
                            d.transaction_count || 1
                    ),

                activeCompanies:
                    new Set(
                        tx.flatMap(
                            d => [
                                d.source,
                                d.target
                            ]
                        )
                    ).size
            };
        });
    }

    // Build legend
    function buildLegend() {

        // Sector legend
        const sectorContainer =
            d3.select("#sector-legend");

        sectorContainer
            .selectAll("*")
            .remove();

        const sectorsPresent =
            Array.from(
                new Set(
                    companiesData.map(
                        d => d.sector
                    )
                )
            );

        sectorsPresent.forEach(
            sector => {

                sectorContainer
                    .append("div")
                    .attr(
                        "class",
                        "lab7-legend-item"
                    )
                    .html(`
                        <span
                            class="lab7-legend-color"
                            style="background:${sectorColorScale(sector)}">
                        </span>
                        <span>${sector}</span>
                    `);
            }
        );

        // Region legend
        const regionContainer =
            d3.select("#region-legend");

        regionContainer
            .selectAll("*")
            .remove();

        regions.forEach(
            (region, i) => {

                regionContainer
                    .append("div")
                    .attr(
                        "class",
                        "lab7-legend-item"
                    )
                    .html(`
                        <span
                            class="lab7-region-swatch"
                            style="background:${regionTint[i % regionTint.length]}">
                        </span>
                        <span>${region}</span>
                    `);
            }
        );
    }

    // Draw region backgrounds
    function drawRegionStructure() {

        const bandWidth =
            networkWidth /
            regions.length;

        const background =
            svg.append("g")
                .attr(
                    "class",
                    "lab7-region-bands"
                );

        regions.forEach(
            (region, i) => {

                // Region background rectangle.
                background
                    .append("rect")
                    .attr(
                        "x",
                        i * bandWidth + 8
                    )
                    .attr(
                        "y",
                        52
                    )
                    .attr(
                        "width",
                        bandWidth - 16
                    )
                    .attr(
                        "height",
                        networkHeight - 70
                    )
                    .attr(
                        "rx",
                        16
                    )
                    .attr(
                        "fill",
                        regionTint[
                            i %
                            regionTint.length
                        ]
                    );

                // Region heading.
                background
                    .append("text")
                    .attr(
                        "class",
                        "lab7-region-heading"
                    )
                    .attr(
                        "x",
                        i * bandWidth +
                        bandWidth / 2
                    )
                    .attr(
                        "y",
                        34
                    )
                    .attr(
                        "text-anchor",
                        "middle"
                    )
                    .text(region);
            }
        );

        // Keep region backgrounds behind links and nodes.
        background.lower();

        // Create layers.
        svg.append("g")
            .attr(
                "class",
                "lab7-links"
            );

        svg.append("g")
            .attr(
                "class",
                "lab7-nodes"
            );

        svg.append("g")
            .attr(
                "class",
                "lab7-labels"
            );

        // Label showing the largest transaction of the day.
        svg.append("text")
            .attr(
                "id",
                "lab7-top-flow"
            )
            .attr(
                "class",
                "lab7-top-flow"
            )
            .attr(
                "x",
                networkWidth / 2
            )
            .attr(
                "y",
                networkHeight - 18
            )
            .attr(
                "text-anchor",
                "middle"
            );
    }

    // Draw company nodes
    function drawNodes() {

        const nodeGroup =
            svg.select(
                ".lab7-nodes"
            );

        const labelGroup =
            svg.select(
                ".lab7-labels"
            );

        // Nodes
        nodeGroup
            .selectAll("circle")
            .data(
                companiesData,
                d => d.id
            )
            .join("circle")
            .attr(
                "class",
                "lab7-node"
            )
            .attr(
                "cx",
                d => d.x
            )
            .attr(
                "cy",
                d => d.y
            )
            .attr(
                "r",
                10
            )
            .attr(
                "fill",
                d =>
                    sectorColorScale(
                        d.sector
                    )
            )
            .attr(
                "stroke",
                "#ffffff"
            )
            .attr(
                "stroke-width",
                3
            )
            .on(
                "mouseover",
                (event, d) =>
                    handleNodeHover(
                        event,
                        d
                    )
            )
            .on(
                "mousemove",
                moveTooltip
            )
            .on(
                "mouseout",
                clearHighlight
            );

        // Node labels
        labelGroup
            .selectAll("text")
            .data(
                companiesData,
                d => d.id
            )
            .join("text")
            .attr(
                "class",
                "lab7-node-label"
            )
            .attr(
                "x",
                d => d.x
            )
            .attr(
                "y",
                d => d.y + 39
            )
            .attr(
                "text-anchor",
                "middle"
            )
            .text(
                d => d.company_name
            );
    }

    // Draw 60-day timeline
    function drawTimeline() {

        const margin = {
            top: 16,
            right: 24,
            bottom: 34,
            left: 58
        };

        // Timeline scales
        xTimeline = d3.scaleLinear()
            .domain([
                1,
                60
            ])
            .range([
                margin.left,
                timelineWidth -
                margin.right
            ]);

        yTimeline = d3.scaleLinear()
            .domain([
                0,
                d3.max(
                    dailySummary,
                    d => d.totalValue
                ) || 1
            ])
            .nice()
            .range([
                timelineHeight -
                margin.bottom,
                margin.top
            ]);

        // Area
        const area = d3.area()
            .x(
                d =>
                    xTimeline(
                        d.day
                    )
            )
            .y0(
                timelineHeight -
                margin.bottom
            )
            .y1(
                d =>
                    yTimeline(
                        d.totalValue
                    )
            )
            .curve(
                d3.curveMonotoneX
            );

        // Line
        const line = d3.line()
            .x(
                d =>
                    xTimeline(
                        d.day
                    )
            )
            .y(
                d =>
                    yTimeline(
                        d.totalValue
                    )
            )
            .curve(
                d3.curveMonotoneX
            );

        // Area chart.
        timelineSvg
            .append("path")
            .datum(dailySummary)
            .attr(
                "class",
                "lab7-volume-area"
            )
            .attr(
                "d",
                area
            );

        // Line chart.
        timelineSvg
            .append("path")
            .datum(dailySummary)
            .attr(
                "class",
                "lab7-volume-line"
            )
            .attr(
                "d",
                line
            );

        // X axis
        timelineSvg
            .append("g")
            .attr(
                "class",
                "lab7-timeline-axis"
            )
            .attr(
                "transform",
                `translate(
                    0,
                    ${timelineHeight - margin.bottom}
                )`
            )
            .call(
                d3.axisBottom(
                    xTimeline
                )
                .tickValues([
                    1,
                    10,
                    20,
                    30,
                    40,
                    50,
                    60
                ])
                .tickFormat(
                    d =>
                        `Day ${d}`
                )
            );

        // Y-axis
        timelineSvg
            .append("g")
            .attr(
                "class",
                "lab7-timeline-axis"
            )
            .attr(
                "transform",
                `translate(
                    ${margin.left},
                    0
                )`
            )
            .call(
                d3.axisLeft(
                    yTimeline
                )
                .ticks(3)
                .tickFormat(
                    d3.format("~s")
                )
            );

        // Y-axis label.
        timelineSvg
            .append("text")
            .attr(
                "class",
                "lab7-axis-label"
            )
            .attr(
                "transform",
                "rotate(-90)"
            )
            .attr(
                "x",
                -(
                    timelineHeight -
                    margin.bottom +
                    margin.top
                ) / 2
            )
            .attr(
                "y",
                15
            )
            .attr(
                "text-anchor",
                "middle"
            )
            .text(
                "Daily value ($)"
            );

        // Current-day marker
        const marker =
            timelineSvg
                .append("g")
                .attr(
                    "id",
                    "lab7-timeline-marker"
                );

        marker
            .append("line")
            .attr(
                "class",
                "lab7-marker-line"
            )
            .attr(
                "y1",
                margin.top
            )
            .attr(
                "y2",
                timelineHeight -
                margin.bottom
            );

        marker
            .append("circle")
            .attr(
                "class",
                "lab7-marker-dot"
            )
            .attr(
                "r",
                5
            );

        // Clickable timeline
        timelineSvg
            .append("rect")
            .attr(
                "class",
                "lab7-timeline-hitbox"
            )
            .attr(
                "x",
                margin.left
            )
            .attr(
                "y",
                margin.top
            )
            .attr(
                "width",
                timelineWidth -
                margin.left -
                margin.right
            )
            .attr(
                "height",
                timelineHeight -
                margin.top -
                margin.bottom
            )
            .attr(
                "fill",
                "transparent"
            )
            .style(
                "cursor",
                "ew-resize"
            )
            .on(
                "click",
                event => {

                    pause();

                    const [pointerX] =
                        d3.pointer(
                            event,
                            timelineSvg.node()
                        );

                    const day =
                        Math.max(
                            1,
                            Math.min(
                                60,
                                Math.round(
                                    xTimeline.invert(
                                        pointerX
                                    )
                                )
                            )
                        );

                    showDay(day);
                }
            );
    }

    // Update visualization for selected day
    function showDay(
        day,
        animate = true
    ) {

        currentDay = day;

        const currentTransactions =
            transactionsByDay.get(day) || [];

        const summary =
            dailySummary[
                day - 1
            ];

        // Date label
         d3.select(
            "#date-label"
        )
        .text(
            summary.date
                ? `Day ${day} | ${summary.date}`
                : `Day ${day}`
        );

        // Update slider.
        d3.select(
            "#time-slider"
        )
        .property(
            "value",
            day
        );

        // Summary statistics
        d3.select(
            "#stat-active-companies"
        )
        .text(
            summary.activeCompanies
        );

        d3.select(
            "#stat-active-links"
        )
        .text(
            summary.transactionCount
                .toLocaleString()
        );

        d3.select(
            "#stat-daily-value"
        )
        .text(
            formatCurrency(
                summary.totalValue
            )
        );

        // Update visual components
        updateTimelineMarker(
            summary
        );

        updateNodes(
            currentTransactions,
            animate
        );

        updateLinks(
            currentTransactions,
            animate
        );

        updateTopFlow(
            currentTransactions
        );
    }

    // Timeline marker
    function updateTimelineMarker(
        summary
    ) {

        const marker =
            timelineSvg.select(
                "#lab7-timeline-marker"
            );

        const x =
            xTimeline(
                summary.day
            );

        const y =
            yTimeline(
                summary.totalValue
            );

        marker
            .select("line")
            .attr(
                "x1",
                x
            )
            .attr(
                "x2",
                x
            );

        marker
            .select("circle")
            .attr(
                "cx",
                x
            )
            .attr(
                "cy",
                y
            );
    }

    // Update company nodes
    function updateNodes(
        currentTransactions,
        animate
    ) {

        const duration =
            animate ? 260 : 0;

        const activeIds =
            new Set(
                currentTransactions.flatMap(
                    d => [
                        d.source,
                        d.target
                    ]
                )
            );

        svg.selectAll(
            ".lab7-node"
        )
        .classed(
            "is-inactive",
            d =>
                !activeIds.has(
                    d.id
                )
        )
        .transition()
        .duration(
            duration
        )
        .attr(
            "r",
            d => {

                const volume =
                    calculateCompanyVolume(
                        d.id,
                        currentTransactions
                    );

                return volume > 0
                    ? nodeRadiusScale(
                        volume
                    )
                    : 8;
            }
        )
        .attr(
            "opacity",
            d =>
                activeIds.has(
                    d.id
                )
                    ? 1
                    : 0.22
        );

        svg.selectAll(
            ".lab7-node-label"
        )
        .classed(
            "is-inactive",
            d =>
                !activeIds.has(
                    d.id
                )
        );
    }

    // Update transaction links
    function updateLinks(
        currentTransactions,
        animate
    ) {

        const duration =
            animate ? 260 : 0;

        const routedLinks =
            createRoutedLinks(
                currentTransactions
            );

        const linkGroup =
            svg.select(
                ".lab7-links"
            );

        linkGroup
            .selectAll("path")
            .data(
                routedLinks,
                d => d._rowKey
            )
            .join(

                // Enter
                enter =>
                    enter
                        .append("path")
                        .attr(
                            "class",
                            "lab7-link"
                        )
                        .attr(
                            "d",
                            d =>
                                linkPath(d)
                        )
                        .attr(
                            "fill",
                            "none"
                        )
                        .attr(
                            "stroke-width",
                            d =>
                                linkWidthScale(
                                    d.amount_usd
                                )
                        )
                        .attr(
                            "stroke-opacity",
                            0
                        )
                        .attr(
                            "marker-end",
                            "url(#lab7-arrow)"
                        )
                        .on(
                            "mouseover",
                            handleLinkHover
                        )
                        .on(
                            "mousemove",
                            moveTooltip
                        )
                        .on(
                            "mouseout",
                            clearHighlight
                        )
                        .call(
                            enter =>
                                enter
                                    .transition()
                                    .duration(
                                        duration
                                    )
                                    .attr(
                                        "stroke-opacity",
                                        d =>
                                            linkOpacityScale(
                                                d.transaction_count
                                            )
                                    )
                        ),

                // Update
                update =>
                    update
                        .attr(
                            "d",
                            d =>
                                linkPath(d)
                        )
                        .attr(
                            "stroke-width",
                            d =>
                                linkWidthScale(
                                    d.amount_usd
                                )
                        )
                        .call(
                            update =>
                                update
                                    .transition()
                                    .duration(
                                        duration
                                    )
                                    .attr(
                                        "stroke-opacity",
                                        d =>
                                            linkOpacityScale(
                                                d.transaction_count
                                            )
                                    )
                        ),

                // Exit
                exit =>
                    exit
                        .transition()
                        .duration(
                            duration
                        )
                        .attr(
                            "stroke-opacity",
                            0
                        )
                        .remove()
            );
    }

    // Route multiple links
    function createRoutedLinks(
        currentTransactions
    ) {

        const pairGroups =
            d3.group(
                currentTransactions,
                d =>
                    `${d.source}→${d.target}`
            );

        const result = [];

        pairGroups.forEach(
            group => {

                const middle =
                    (
                        group.length - 1
                    ) / 2;

                group.forEach(
                    (d, i) => {

                        result.push({
                            ...d,

                            routeOffset:
                                (
                                    i -
                                    middle
                                ) * 18
                        });
                    }
                );
            }
        );

        return result;
    }

    // Create curved link path
    function linkPath(d) {

        const source =
            companyById.get(
                d.source
            );

        const target =
            companyById.get(
                d.target
            );

        if (
            !source ||
            !target
        ) {
            return "";
        }

        const sourceR =
            getRenderedRadius(
                source.id
            );

        const targetR =
            getRenderedRadius(
                target.id
            );

        const dx =
            target.x -
            source.x;

        const dy =
            target.y -
            source.y;

        const distance =
            Math.hypot(
                dx,
                dy
            ) || 1;

        const ux =
            dx /
            distance;

        const uy =
            dy /
            distance;

        // Start line at edge of source node.
        const sx =
            source.x +
            ux *
            (
                sourceR + 3
            );

        const sy =
            source.y +
            uy *
            (
                sourceR + 3
            );

        // Stop line before target node so arrowhead is visible.
        const tx =
            target.x -
            ux *
            (
                targetR + 9
            );

        const ty =
            target.y -
            uy *
            (
                targetR + 9
            );

        // Same-region connection
        if (
            source.region ===
            target.region
        ) {

            const side =
                source.x <
                networkWidth / 2
                    ? -1
                    : 1;

            const bow =
                72 +
                Math.abs(
                    d.routeOffset || 0
                );

            return `
                M${sx},${sy}
                C
                ${sx + side * bow},
                ${sy + d.routeOffset}
                ${tx + side * bow},
                ${ty + d.routeOffset}
                ${tx},${ty}
            `;
        }

        // Cross-region connection
        const midX =
            (
                sx +
                tx
            ) / 2 +
            (
                d.routeOffset || 0
            );

        return `
            M${sx},${sy}
            C
            ${midX},${sy}
            ${midX},${ty}
            ${tx},${ty}
        `;
    }

    // Get current node radius
    function getRenderedRadius(
        companyId
    ) {

        const node =
            svg
                .selectAll(
                    ".lab7-node"
                )
                .filter(
                    d =>
                        d.id ===
                        companyId
                )
                .node();

        return node
            ? (
                +node.getAttribute(
                    "r"
                ) || 10
            )
            : 10;
    }

    // Display largest flow
    function updateTopFlow(
        currentTransactions
    ) {

        const top =
            d3.greatest(
                currentTransactions,
                d => d.amount_usd
            );

        const label =
            svg.select(
                "#lab7-top-flow"
            );

        if (!top) {

            label.text(
                "No recorded transactions on this day"
            );

            return;
        }

        const sourceName =
            companyById.get(
                top.source
            )?.company_name ||
            top.source;

        const targetName =
            companyById.get(
                top.target
            )?.company_name ||
            top.target;

        label.text(
            `Largest flow: ${sourceName} → ${targetName} · ${formatCurrency(top.amount_usd)}`
        );
    }

    // Company daily transaction volume
    function calculateCompanyVolume(
        companyId,
        currentTransactions
    ) {

        return d3.sum(

            currentTransactions.filter(
                d =>
                    d.source === companyId ||
                    d.target === companyId
            ),

            d =>
                d.amount_usd
        );
    }

    // Node hover
    function handleNodeHover(
        event,
        company
    ) {

        const dayTx =
            transactionsByDay.get(
                currentDay
            ) || [];

        const incident =
            dayTx.filter(
                d =>
                    d.source === company.id ||
                    d.target === company.id
            );

        const sent =
            d3.sum(
                incident.filter(
                    d =>
                        d.source ===
                        company.id
                ),
                d =>
                    d.amount_usd
            );

        const received =
            d3.sum(
                incident.filter(
                    d =>
                        d.target ===
                        company.id
                ),
                d =>
                    d.amount_usd
            );

        const count =
            d3.sum(
                incident,
                d =>
                    d.transaction_count || 1
            );

        // Dim unrelated nodes.
        svg.selectAll(
            ".lab7-node"
        )
        .classed(
            "is-dimmed",
            d =>
                d.id !== company.id &&
                !incident.some(
                    t =>
                        t.source === d.id ||
                        t.target === d.id
                )
        );

        // Highlight connected links.
        svg.selectAll(
            ".lab7-link"
        )
        .classed(
            "is-dimmed",
            d =>
                d.source !== company.id &&
                d.target !== company.id
        )
        .classed(
            "is-highlighted",
            d =>
                d.source === company.id ||
                d.target === company.id
        );

        // Tooltip.
        tooltip
            .style(
                "opacity",
                1
            )
            .html(`
                <strong>${company.company_name}</strong><br>
                <span>${company.region} · ${company.sector}</span>

                <hr>

                <strong>Sent:</strong>
                ${formatCurrency(sent)}
                <br>

                <strong>Received:</strong>
                ${formatCurrency(received)}
                <br>

                <strong>Total volume:</strong>
                ${formatCurrency(sent + received)}
                <br>

                <strong>Transaction count:</strong>
                ${count.toLocaleString()}
            `);

        moveTooltip(
            event
        );
    }

    // Link hover
    function handleLinkHover(
        event,
        d
    ) {

        const source =
            companyById.get(
                d.source
            );

        const target =
            companyById.get(
                d.target
            );

        // Highlight current link.
        svg.selectAll(
            ".lab7-link"
        )
        .classed(
            "is-dimmed",
            link =>
                link._rowKey !==
                d._rowKey
        )
        .classed(
            "is-highlighted",
            link =>
                link._rowKey ===
                d._rowKey
        );

        // Dim unrelated nodes.
        svg.selectAll(
            ".lab7-node"
        )
        .classed(
            "is-dimmed",
            node =>
                node.id !== d.source &&
                node.id !== d.target
        );

        tooltip
            .style(
                "opacity",
                1
            )
            .html(`
                <strong>
                    ${source?.company_name || d.source}
                    →
                    ${target?.company_name || d.target}
                </strong>
                <br>

                <span>
                    ${d.transaction_type || "Transaction"}
                </span>

                <hr>

                <strong>Value:</strong>
                ${formatCurrency(d.amount_usd)}
                <br>

                <strong>Count:</strong>
                ${(d.transaction_count || 1).toLocaleString()}
            `);

        moveTooltip(
            event
        );
    }

    // Move Tooltip
    function moveTooltip(
        event
    ) {

        const container =
            vizContainer.node();

        if (!container) {
            return;
        }

        const rect =
            container
                .getBoundingClientRect();

        tooltip
            .style(
                "left",
                `${
                    event.clientX -
                    rect.left +
                    14
                }px`
            )
            .style(
                "top",
                `${
                    event.clientY -
                    rect.top +
                    14
                }px`
            );
    }

    // Clear highlight
    function clearHighlight() {

        tooltip.style(
            "opacity",
            0
        );

        svg.selectAll(
            ".lab7-node, .lab7-link"
        )
        .classed(
            "is-dimmed",
            false
        )
        .classed(
            "is-highlighted",
            false
        );
    }


    // Controls
    function setupControls() {

        d3.select(
            "#play-btn"
        )
        .on(
            "click",
            play
        );

        d3.select(
            "#pause-btn"
        )
        .on(
            "click",
            pause
        );

        d3.select(
            "#reset-btn"
        )
        .on(
            "click",
            reset
        );

        d3.select(
            "#time-slider"
        )
        .on(
            "input",
            function () {

                pause();

                showDay(
                    +this.value
                );
            }
        );
    }

    // Play animation
    function play() {

        if (timer) {
            return;
        }

        if (
            currentDay >= 60
        ) {
            currentDay = 1;
        }

        timer =
            d3.interval(
                () => {

                    showDay(
                        currentDay
                    );

                    if (
                        currentDay >= 60
                    ) {

                        pause();

                    } else {

                        currentDay += 1;
                    }

                },
                650
            );
    }

    // Pause
    function pause() {

        if (timer) {

            timer.stop();

            timer = null;
        }
    }

    // Reset
    function reset() {

        pause();

        showDay(1);
    }

    // Currency Formatter
    function formatCurrency(
        value
    ) {

        return d3.format(
            "$,.0f"
        )(
            value || 0
        );
    }
});