import time
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup


# Base website used for the assignment
BASE_URL = "https://books.toscrape.com/"

# Informative user agent
HEADERS = {
    "User-Agent": "STATS401-Class-Exercise"
}

# Convert the written star rating into a number
RATING_MAP = {
    "One": 1,
    "Two": 2,
    "Three": 3,
    "Four": 4,
    "Five": 5
}

records = []


# Books to Scrape contains 50 pages with 20 books per page
for page in range(1, 51):

    url = (
        BASE_URL
        + f"catalogue/page-{page}.html"
    )

    try:
        response = requests.get(
            url,
            headers=HEADERS,
            timeout=10
        )

        response.raise_for_status()

    #Basic error handling
    except requests.RequestException as error:
        print(f"Failed to download page {page}:", error)
        continue

    response.encoding = "utf-8"

    soup = BeautifulSoup(response.text, "html.parser")

    books = soup.select("article.product_pod")

    for book in books:

        # Book title
        title = book.select_one("h3 a")["title"]

        # Book price
        price_text = book.select_one(".price_color").get_text(strip=True)

        price = float(price_text.replace("£", ""))

        # Star rating
        rating_element = book.select_one("p.star-rating")

        rating_word = [
            class_name
            for class_name
            in rating_element.get("class", [])
            if class_name != "star-rating"
        ][0]

        rating = RATING_MAP[rating_word]

        # Availability
        availability = book.select_one(
            ".availability"
        ).get_text(
            " ",
            strip=True
        )

        records.append({
            "book_id": len(records) + 1,
            "title": title,
            "price_gbp": price,
            "rating": rating,
            "availability": availability
        })

    print(
        f"Downloaded page {page}. "
        f"Total records: {len(records)}"
    )

    # Basic rate limiting
    time.sleep(1)


# Make sure the assignment requirement was met (more error handling)
if len(records) < 1000:
    raise RuntimeError(
        f"Only {len(records)} records were collected. "
        "Run the script again before submitting."
    )

records = records[:1000] # Keep exactly 1,000 records

df = pd.DataFrame(records)

# Find the data folder relative to this script
data_folder = (
    Path(__file__).resolve().parent.parent
    / "data"
)

data_folder.mkdir(
    parents=True,
    exist_ok=True
)

# Save the data as CSV
output_file = (data_folder/"lab3_data.csv")

df.to_csv(output_file, index=False)

print()
print("Scraping complete!")
print("Records collected:", len(df))
print("Saved to:", output_file)
print()
print(df.head())