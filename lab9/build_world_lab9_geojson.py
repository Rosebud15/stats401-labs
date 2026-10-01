"""Build the GeoJSON included with STATS 401 Lab 9.

From the root of stats401-labs, run:
    pip install pyogrio shapely
    python build_world_lab9_geojson.py

By default this uses the Natural Earth low-resolution shapefile bundled with
pyogrio's test fixtures (when installed). If that file is unavailable, pass a
path to a compatible Natural Earth low-resolution shapefile:
    python build_world_lab9_geojson.py --shapefile /path/to/naturalearth_lowres.shp
"""

import argparse
import json
from pathlib import Path

import pyogrio
from shapely.geometry import mapping


def build_geojson(shapefile: Path, output: Path) -> None:
    world = pyogrio.read_dataframe(shapefile)
    features = []

    for _, row in world.iterrows():
        name = row["name"]

        # Leave out Antarctica so the map focuses on inhabited economies.
        if name == "Antarctica":
            continue

        iso3 = row["iso_a3"]
        # These two entries are '-99' in this Natural Earth source.
        if name == "France":
            iso3 = "FRA"
        elif name == "Norway":
            iso3 = "NOR"

        features.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "iso3": iso3,
                "geometry_kind": "boundary",
            },
            "geometry": mapping(row.geometry),
        })

    # The low-resolution boundaries do not supply separate polygons for these
    # two entries in the instructor's GDP file. Use approximate point markers.
    markers = [
        ("Singapore", "SGP", 103.8198, 1.3521),
        ("Hong Kong SAR", "HKG", 114.1694, 22.3193),
    ]
    for name, iso3, longitude, latitude in markers:
        features.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "iso3": iso3,
                "geometry_kind": "location_marker",
            },
            "geometry": {
                "type": "Point",
                "coordinates": [longitude, latitude],
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(features)} features to {output}")


if __name__ == "__main__":
    fixture = (Path(pyogrio.__file__).resolve().parent / "tests" / "fixtures"
               / "naturalearth_lowres" / "naturalearth_lowres.shp")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shapefile", type=Path, default=fixture)
    parser.add_argument("--output", type=Path, default=Path("data/world_lab9.geojson"))
    args = parser.parse_args()
    if not args.shapefile.is_file():
        parser.error(
            f"Shapefile not found: {args.shapefile}. "
            "Pass --shapefile with a path to a compatible Natural Earth shapefile."
        )
    build_geojson(args.shapefile, args.output)
