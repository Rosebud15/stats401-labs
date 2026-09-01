d3.csv(
    "../data/lab3_data.csv",
    d3.autoType
)
.then(data => {

    // Display the number of records
    d3.select("#record-count")
        .text(data.length.toLocaleString());


    // Get column names from the CSV
    const columns = data.columns;


    // Keep track of sorting
    let sortColumn = null;
    let ascending = true;


    // Select the table
    const table = d3.select(
        "#data-table"
    );


    // Create the table header
    const header = table
        .select("thead")
        .append("tr");


    header
        .selectAll("th")
        .data(columns)
        .join("th")
        .text(column => column)
        .on(
            "click",
            function(event, column) {

                // If the same column is clicked again,
                // reverse the sorting direction
                if (sortColumn === column) {

                    ascending = !ascending;

                } else {

                    sortColumn = column;
                    ascending = true;

                }


                // Sort the data
                data.sort(
                    (a, b) => {

                        if (ascending) {

                            return d3.ascending(
                                a[column],
                                b[column]
                            );

                        } else {

                            return d3.descending(
                                a[column],
                                b[column]
                            );

                        }

                    }
                );


                // Redraw the table
                updateRows();

            }
        );


    // Function for drawing table rows
    function updateRows() {

        const rows = table
            .select("tbody")
            .selectAll("tr")
            .data(data);


        rows
            .join("tr")
            .selectAll("td")
            .data(
                row =>
                    columns.map(
                        column =>
                            row[column]
                    )
            )
            .join("td")
            .text(value => value);

    }


    // Draw the table initially
    updateRows();

})
.catch(error => {

    console.error(
        "Error loading dataset:",
        error
    );

});