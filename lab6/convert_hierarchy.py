import json
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
INPUT_PATH = BASE_DIR.parent / "data" / "lab6_assignment_gdp.csv"
OUTPUT_PATH = BASE_DIR.parent / "data" / "lab6_assignment_gdp.json"


def build_hierarchy(dataframe, levels):
    """Recursively convert the flat GDP table into nested hierarchy nodes."""
    if len(levels) == 1:
        leaves = []

        for _, row in dataframe.iterrows():
            leaves.append(
                {
                    "name": row[levels[0]],
                    "gdp": int(row["gdp_billion_usd"]),
                    "status": row["gdp_status"],
                }
            )

        return leaves

    current_level = levels[0]
    children = []

    # sort=False preserves the order used in the provided CSV.
    for value, group in dataframe.groupby(current_level, sort=False):
        children.append(
            {
                "name": value,
                "children": build_hierarchy(group, levels[1:]),
            }
        )

    return children


def main():
    df = pd.read_csv(INPUT_PATH)

    hierarchy = {
        "name": "World",
        "children": build_hierarchy(
            df,
            ["continent", "area", "country"],
        ),
    }

    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(hierarchy, file, indent=2, ensure_ascii=False)

    print(f"Wrote hierarchical JSON to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
