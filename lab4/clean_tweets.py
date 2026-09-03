from pathlib import Path
import re
import sys

import pandas as pd
import requests
import torch
from transformers import pipeline

# Paths and source
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA_DIR = ROOT / "data"
RAW_PATH = DATA_DIR / "lab4_raw_tweets.csv"
CLEAN_PATH = DATA_DIR / "lab4_clean_tweets.csv"

# Public mirror of the CrowdFlower/Kaggle Twitter US Airline Sentiment dataset.
DATA_URL = (
    "https://raw.githubusercontent.com/ruchitgandhi/"
    "Twitter-Airline-Sentiment-Analysis/refs/heads/master/Tweets.csv"
)

MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"


def download_raw_data():
    """Download the raw dataset if it is not already present."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if RAW_PATH.exists():
        print(f"Using existing raw dataset: {RAW_PATH}")
        return

    print("Downloading raw Twitter US Airline Sentiment dataset...")
    response = requests.get(DATA_URL, timeout=60)
    response.raise_for_status()
    RAW_PATH.write_bytes(response.content)
    print(f"Saved raw dataset to: {RAW_PATH}")


def prepare_for_roberta(text):
    """Lightly normalize social-media text while preserving sentiment cues."""
    text = str(text)
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


def scores_to_dict(scores):
    """Convert model output into negative, neutral, and positive scores."""
    label_aliases = {
        "negative": "negative",
        "neutral": "neutral",
        "positive": "positive",
        "label_0": "negative",
        "label_1": "neutral",
        "label_2": "positive",
    }

    result = {
        "negative": 0.0,
        "neutral": 0.0,
        "positive": 0.0,
    }

    for item in scores:
        label = str(item["label"]).lower()
        normalized_label = label_aliases.get(label)

        if normalized_label is not None:
            result[normalized_label] = float(item["score"])

    return result


def main():
    download_raw_data()

    # Read tweet IDs as strings so their full digits are preserved.
    df = pd.read_csv(
        RAW_PATH,
        dtype={"tweet_id": "string"},
    )

    required_columns = {
        "tweet_id",
        "text",
        "airline",
        "retweet_count",
        "tweet_created",
    }

    missing_columns = required_columns.difference(df.columns)

    if missing_columns:
        raise ValueError(
            "Dataset is missing required columns: "
            + ", ".join(sorted(missing_columns))
        )

    # Inspect the raw data
    print("\nRAW DATA PREVIEW")
    print(df.head())

    print("\nShape:", df.shape)

    print("\nData types:")
    print(df.dtypes)

    print("\nMissing values:")
    print(df.isna().sum())

    print("\nExact duplicate rows:", df.duplicated().sum())
    print(
        "Duplicate tweet IDs:",
        df.duplicated(subset=["tweet_id"]).sum(),
    )

    # Clean structured attributes
    df = df.dropna(subset=["text", "airline"]).copy()

    df = df.drop_duplicates()
    df = df.drop_duplicates(
        subset=["tweet_id"],
        keep="first",
    )

    df["retweet_count"] = pd.to_numeric(
        df["retweet_count"],
        errors="coerce",
    )

    df.loc[
        df["retweet_count"] < 0,
        "retweet_count",
    ] = pd.NA

    df["retweet_count"] = (
        df["retweet_count"]
        .fillna(0)
        .astype(int)
    )

    df["created_at"] = pd.to_datetime(
        df["tweet_created"],
        errors="coerce",
        utc=True,
    )

    df["date"] = df["created_at"].dt.strftime(
        "%Y-%m-%d"
    )

    df["airline"] = (
        df["airline"]
        .astype("string")
        .str.strip()
    )

    df["tweet_text_raw"] = (
        df["text"]
        .astype("string")
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )

    # RoBERTa sentiment analysis
    df["sentiment_text"] = (
        df["tweet_text_raw"]
        .apply(prepare_for_roberta)
    )

    sentiment_model = pipeline(
        "sentiment-analysis",
        model=MODEL_NAME,
        top_k=None,
    )

    print(
        f"Running RoBERTa sentiment analysis "
        f"on {len(df):,} tweets..."
    )

    results = sentiment_model(
        df["sentiment_text"].tolist(),
        truncation=True,
        batch_size=32,
    )

    score_dicts = [
        scores_to_dict(scores)
        for scores in results
    ]

    df["sentiment_negative"] = [
        scores["negative"]
        for scores in score_dicts
    ]

    df["sentiment_neutral"] = [
        scores["neutral"]
        for scores in score_dicts
    ]

    df["sentiment_positive"] = [
        scores["positive"]
        for scores in score_dicts
    ]

    df["sentiment"] = [
        max(scores, key=scores.get).capitalize()
        for scores in score_dicts
    ]

    # sentiment_score = P(positive) - P(negative)
    df["sentiment_score"] = (
        df["sentiment_positive"]
        - df["sentiment_negative"]
    )

    # Create tidy visualization-ready data
    vis_df = df[[
        "tweet_id",
        "created_at",
        "date",
        "airline",
        "tweet_text_raw",
        "retweet_count",
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "sentiment_score",
        "sentiment",
    ]].copy()

    print("\nFINAL DATA PREVIEW")
    print(vis_df.head())

    print("\nFinal shape:", vis_df.shape)

    print("\nMissing values in final data:")
    print(vis_df.isna().sum())

    print("\nSentiment counts:")
    print(vis_df["sentiment"].value_counts())

    if len(vis_df) < 1000:
        print(
            "ERROR: fewer than 1,000 tweets remain after cleaning.",
            file=sys.stderr,
        )
        sys.exit(1)

    vis_df.to_csv(
        CLEAN_PATH,
        index=False,
    )

    print(f"\nSaved cleaned data to: {CLEAN_PATH}")


if __name__ == "__main__":
    main()
