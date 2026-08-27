async function loadData() {

    const data = await d3.csv(
        "../data/students.csv",
        d => ({
            name: d.name,
            score: +d.score
        })
    );

    const width = 800;
    const height = 400;

    const margin = {
        top: 20,
        right: 20,
        bottom: 80,
        left: 20
    };

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 30)
        .attr("text-anchor", "middle")
        .attr("font-size", "20px")
        .attr("font-weight", "bold")
        .text("Student Scores");

    const chart = svg.append("g")
        .attr(
            "transform",
            `translate(${margin.left}, ${margin.top})`
        );

    const barWidth = chartWidth / data.length;

    chart.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("class", "bar")
        .attr("x", (d, i) => i * barWidth + 10)
        .attr("y", d => chartHeight - d.score * 3)
        .attr("width", barWidth - 20)
        .attr("height", d => d.score * 3);

    chart.selectAll(".student-score")
        .data(data)
        .join("text")
        .attr("class", "student-score")
        .attr("x", (d, i) => i * barWidth + barWidth / 2)
        .attr("y", chartHeight + 25)
        .text(d => d.score);

    chart.selectAll(".student-name")
        .data(data)
        .join("text")
        .attr("class", "student-name")
        .attr("x", (d, i) => i * barWidth + barWidth / 2)
        .attr("y", chartHeight + 50)
        .text(d => d.name);
}

loadData();