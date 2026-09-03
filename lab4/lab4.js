const dataPath = "../data/lab4_clean_tweets.csv";

const sentimentOrder = ["Negative", "Neutral", "Positive"];

const sentimentColors = new Map([
    ["Negative", "#c54f4f"],
    ["Neutral", "#8a8f98"],
    ["Positive", "#3d8f6f"]
]);

const tooltip = d3.select("#tooltip");


function renderLegend() {
    const legend = d3.select("#legend");

    const items = legend
        .selectAll("div.legend-item")
        .data(sentimentOrder)
        .join("div")
        .attr("class", "legend-item");

    items
        .append("span")
        .attr("class", "legend-swatch")
        .style("background-color", d => sentimentColors.get(d));

    items
        .append("span")
        .text(d => d);
}

function updateAnalysis(data) {
    // Most common sentiment overall
    const sentimentCounts = d3.rollup(
        data,
        tweets => tweets.length,
        d => d.sentiment
    );

    const dominantSentiment = Array.from(sentimentCounts)
        .sort((a, b) => d3.descending(a[1], b[1]))[0][0];


    // Average sentiment score by airline
    const airlineScores = Array.from(
        d3.rollup(
            data,
            tweets => d3.mean(
                tweets,
                d => d.sentiment_score
            ),
            d => d.airline
        ),
        ([airline, avgScore]) => ({
            airline,
            avgScore
        })
    ).sort(
        (a, b) =>
            d3.descending(a.avgScore, b.avgScore)
    );


    const highestAirline = airlineScores[0].airline;

    const lowestAirline =
        airlineScores[airlineScores.length - 1].airline;


    // Insert values into HTML
    d3.select("#dominant-sentiment")
        .text(dominantSentiment);

    d3.select("#highest-airline")
        .text(highestAirline);

    d3.select("#lowest-airline")
        .text(lowestAirline);
}


function drawChart(data) {
    const chartNode = document.getElementById("chart");
    const containerWidth = Math.max(chartNode.clientWidth, 720);

    const margin = {
        top: 20,
        right: 48,
        bottom: 55,
        left: 125
    };

    const width = containerWidth;
    const innerWidth = width - margin.left - margin.right;

    const airlineStats = Array.from(
        d3.group(data, d => d.airline),
        ([airline, tweets]) => {
            const counts = Object.fromEntries(
                sentimentOrder.map(sentiment => [
                    sentiment,
                    tweets.filter(
                        d => d.sentiment === sentiment
                    ).length
                ])
            );

            const total = tweets.length;

            return {
                airline,
                total,
                avgScore: d3.mean(
                    tweets,
                    d => d.sentiment_score
                ),
                Negative: counts.Negative / total,
                Neutral: counts.Neutral / total,
                Positive: counts.Positive / total,
                Negative_count: counts.Negative,
                Neutral_count: counts.Neutral,
                Positive_count: counts.Positive
            };
        }
    ).sort(
        (a, b) =>
            d3.descending(a.avgScore, b.avgScore)
    );

    const rowHeight = 60;

    const height =
        margin.top +
        margin.bottom +
        airlineStats.length * rowHeight;

    const innerHeight =
        height -
        margin.top -
        margin.bottom;

    const svg = d3
        .select("#chart")
        .append("svg")
        .attr(
            "viewBox",
            `0 0 ${width} ${height}`
        )
        .attr("role", "img")
        .attr(
            "aria-label",
            "100 percent stacked bar chart of RoBERTa tweet sentiment by airline"
        );

    const g = svg
        .append("g")
        .attr(
            "transform",
            `translate(${margin.left},${margin.top})`
        );

    const x = d3
        .scaleLinear()
        .domain([0, 1])
        .range([0, innerWidth]);

    const y = d3
        .scaleBand()
        .domain(
            airlineStats.map(d => d.airline)
        )
        .range([0, innerHeight])
        .padding(0.24);


    // Grid lines
    g.append("g")
        .attr("class", "grid")
        .call(
            d3.axisBottom(x)
                .tickValues([
                    0,
                    0.25,
                    0.5,
                    0.75,
                    1
                ])
                .tickSize(innerHeight)
                .tickFormat("")
        );


    // Create stacked sentiment data
    const stack = d3
        .stack()
        .keys(sentimentOrder)
        .offset(d3.stackOffsetExpand);

    const series = stack(airlineStats);


    // Draw bars
    g.selectAll("g.sentiment-layer")
        .data(series)
        .join("g")
        .attr(
            "class",
            "sentiment-layer"
        )
        .attr(
            "fill",
            d => sentimentColors.get(d.key)
        )
        .selectAll("rect")
        .data(layer =>
            layer.map(segment => ({
                ...segment,
                key: layer.key
            }))
        )
        .join("rect")
        .attr(
            "x",
            d => x(d[0])
        )
        .attr(
            "y",
            d => y(d.data.airline)
        )
        .attr(
            "width",
            d =>
                Math.max(
                    0,
                    x(d[1]) - x(d[0])
                )
        )
        .attr(
            "height",
            y.bandwidth()
        )
        .on(
            "mousemove",
            (event, d) => {
                const percent =
                    d.data[d.key];

                const count =
                    d.data[
                        `${d.key}_count`
                    ];

                tooltip
                    .style("opacity", 1)
                    .style(
                        "left",
                        `${event.pageX + 14}px`
                    )
                    .style(
                        "top",
                        `${event.pageY - 28}px`
                    )
                    .html(
                        `<strong>${d.data.airline}</strong><br>` +
                        `${d.key}: ${d3.format(".1%")(percent)} ` +
                        `(${d3.format(",")(count)} tweets)<br>` +
                        `Average score: ${d3.format("+.3f")(d.data.avgScore)}`
                    );
            }
        )
        .on(
            "mouseleave",
            () => {
                tooltip.style(
                    "opacity",
                    0
                );
            }
        );


    // Y-axis
    g.append("g")
        .attr(
            "class",
            "axis y-axis"
        )
        .call(
            d3.axisLeft(y)
                .tickSize(0)
        )
        .call(
            axis =>
                axis
                    .select(".domain")
                    .remove()
        );


    // X-axis
    g.append("g")
        .attr(
            "class",
            "axis x-axis"
        )
        .attr(
            "transform",
            `translate(0,${innerHeight})`
        )
        .call(
            d3.axisBottom(x)
                .tickValues([
                    0,
                    0.25,
                    0.5,
                    0.75,
                    1
                ])
                .tickFormat(
                    d3.format(".0%")
                )
        )
        .call(
            axis =>
                axis
                    .select(".domain")
                    .remove()
        );


    // X-axis label
    svg.append("text")
        .attr(
            "class",
            "axis-label"
        )
        .attr(
            "x",
            margin.left +
                innerWidth / 2
        )
        .attr(
            "y",
            height - 10
        )
        .attr(
            "text-anchor",
            "middle"
        )
        .text("Share of tweets");
}


renderLegend();


d3.csv(
    dataPath,
    d => ({
        ...d,
        retweet_count:
            +d.retweet_count,
        sentiment_negative:
            +d.sentiment_negative,
        sentiment_neutral:
            +d.sentiment_neutral,
        sentiment_positive:
            +d.sentiment_positive,
        sentiment_score:
            +d.sentiment_score
    })
)
.then(data => {
    const valid = data.filter(
        d =>
            d.airline &&
            sentimentOrder.includes(
                d.sentiment
            ) &&
            Number.isFinite(
                d.sentiment_score
            )
    );

    if (valid.length < 1000) {
        throw new Error(
            `Only ${valid.length} usable tweets were loaded; ` +
            "at least 1,000 are required."
        );
    }

    drawChart(valid);
    updateAnalysis(valid);
})
.catch(error => {
    console.error(error);

    d3.select("#error-message")
        .attr("hidden", null)
        .text(
            "The cleaned CSV could not be loaded. " +
            "Run lab4/clean_tweets.py first, then serve " +
            "the repository with a local web server or GitHub Pages."
        );
});