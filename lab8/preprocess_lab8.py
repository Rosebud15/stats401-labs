#!/usr/bin/env python3
"""Prepare visualization data for STATS 401 Lab 8.

This script downloads the DKU bulletin into ../data/, extracts and cleans meaningful
passages, preserves document hierarchy, creates semantic embeddings, runs UMAP and
KMeans, calculates nearest semantic neighbors, and writes the data files used by D3.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

import pymupdf


# Paths and settings
LAB_DIR = Path(__file__).resolve().parent
ROOT_DIR = LAB_DIR.parent
DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

PDF_URL = (
    "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/"
    "dkumain/files/V2021-22_DKU_UG_Bulletin.pdf"
)
PDF_PATH = DATA_DIR / "DKU_UG_Bulletin_2021-22.pdf"

PASSAGES_PATH = DATA_DIR / "bulletin_passages.csv"
MAP_PATH = DATA_DIR / "lab8_embedding_map.csv"
MATRIX_PATH = DATA_DIR / "lab8_topic_section_matrix.csv"
SUMMARY_PATH = DATA_DIR / "lab8_summary.json"
REPORT_PATH = DATA_DIR / "lab8_cluster_report.txt"

MODEL_NAME = "all-MiniLM-L6-v2"
N_CLUSTERS = 8
RANDOM_STATE = 401


# Download
def download_pdf() -> None:
    """Download the bulletin into the repository's shared data folder."""
    if PDF_PATH.exists():
        print(f"Using existing PDF: {PDF_PATH}")
        return

    print("Downloading DKU bulletin...")
    request = Request(PDF_URL, headers={"User-Agent": "Mozilla/5.0"})

    try:
        with urlopen(request, timeout=60) as response, PDF_PATH.open("wb") as f:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception:
        PDF_PATH.unlink(missing_ok=True)
        raise RuntimeError(
            "Could not download the bulletin. Check your internet connection and "
            f"whether this URL opens in your browser:\n{PDF_URL}"
        )

    print(f"Saved PDF to: {PDF_PATH}")


# Passage extraction
def normalize(text: str) -> str:
    text = text.replace("\u00ad", "").replace("\ufffe", "").replace("\uf0a7", "•")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def heading_key(text: str) -> str:
    """Normalize headings so PDF blocks can be matched to the PDF table of contents."""
    text = normalize(text).lower()
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def split_long_passage(text: str, max_words: int = 190) -> list[str]:
    """Split unusually long PDF blocks at sentence boundaries."""
    words = text.split()
    if len(words) <= max_words:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks = []
    current = []
    current_words = 0

    for sentence in sentences:
        n = len(sentence.split())
        if current and current_words + n > max_words:
            chunks.append(" ".join(current))
            current = []
            current_words = 0
        current.append(sentence)
        current_words += n

    if current:
        chunks.append(" ".join(current))

    return chunks


def extract_passages() -> tuple[list[dict], int]:
    """Extract paragraphs/policy blocks and preserve bulletin hierarchy metadata."""
    doc = pymupdf.open(PDF_PATH)
    toc = doc.get_toc(simple=True)

    # PDF TOC entries are [level, title, page]. Group them by printed PDF page.
    headings_by_page: dict[int, list[tuple[int, str, str]]] = defaultdict(list)
    for level, title, page in toc:
        headings_by_page[int(page)].append((int(level), normalize(title), heading_key(title)))

    current = {1: "", 2: "", 3: "", 4: ""}
    raw_passages = 0
    passages: list[dict] = []
    seen_text = set()

    for page_index in range(len(doc)):
        page_number = page_index + 1

        # Pages 1-9 are cover/front matter/table of contents. The structured
        # bulletin content begins on page 10.
        if page_number <= 9:
            continue

        page_headings = headings_by_page.get(page_number, [])
        heading_lookup = {key: (level, title) for level, title, key in page_headings}

        for block in doc[page_index].get_text("blocks"):
            text = normalize(block[4])
            if not text:
                continue

            # Page numbers are not content.
            if re.fullmatch(r"\d+", text):
                continue

            key = heading_key(text)

            # Update hierarchy when the current PDF block is a TOC heading.
            if key in heading_lookup:
                level, title = heading_lookup[key]
                current[level] = title
                for deeper in range(level + 1, 5):
                    current[deeper] = ""
                continue

            raw_passages += 1

            # Ignore obvious fragments that are not independently interpretable.
            if len(text.split()) < 12:
                continue
            if text.lower().startswith("table of contents"):
                continue

            for chunk in split_long_passage(text):
                chunk = normalize(chunk)
                if len(chunk.split()) < 12:
                    continue
                if chunk in seen_text:
                    continue
                seen_text.add(chunk)

                chapter = current[1] or "Uncategorized"
                section = current[2] or chapter
                # Keep the deepest available heading as subsection. This makes
                # course descriptions identifiable by course title when present.
                subsection = current[4] or current[3] or ""

                passages.append(
                    {
                        "passage_id": f"p{len(passages) + 1:04d}",
                        "chapter": chapter,
                        "section": section,
                        "subsection": subsection,
                        "page": page_number,
                        "text": chunk,
                        "word_count": len(chunk.split()),
                    }
                )

    doc.close()
    return passages, raw_passages


# Semantic analysis
def top_tfidf_terms(texts, clusters, np, TfidfVectorizer):
    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_features=5000,
        max_df=0.90,
        ngram_range=(1, 2),
    )
    matrix = vectorizer.fit_transform(texts)
    terms = np.array(vectorizer.get_feature_names_out())

    overall_scores = np.asarray(matrix.mean(axis=0)).ravel()
    overall = terms[overall_scores.argsort()[::-1][:12]].tolist()

    cluster_terms: dict[int, list[str]] = {}
    for cluster in sorted(set(clusters.tolist())):
        rows = np.where(clusters == cluster)[0]
        scores = np.asarray(matrix[rows].mean(axis=0)).ravel()
        cluster_terms[cluster] = terms[scores.argsort()[::-1][:6]].tolist()

    return overall, cluster_terms


def make_topic_names(cluster_terms: dict[int, list[str]]) -> dict[int, str]:
    """Create data-driven topic labels directly from each cluster's TF-IDF terms."""
    names = {}
    used = Counter()

    for cluster, terms in cluster_terms.items():
        chosen = terms[:3]
        name = " / ".join(term.title() for term in chosen)
        used[name] += 1
        if used[name] > 1:
            name = f"{name} ({used[name]})"
        names[cluster] = name

    return names


def semantic_analysis(passages: list[dict]):
    try:
        import numpy as np
        import umap
        from sentence_transformers import SentenceTransformer
        from sklearn.cluster import KMeans
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.neighbors import NearestNeighbors
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing a semantic-analysis dependency. Run:\n\n"
            "    python -m pip install -r requirements.txt\n"
        ) from exc

    texts = [p["text"] for p in passages]

    print(f"Creating semantic embeddings with {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    print("Running UMAP...")
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.15,
        metric="cosine",
        random_state=RANDOM_STATE,
    )
    coords = reducer.fit_transform(embeddings)

    print(f"Clustering into {N_CLUSTERS} topics...")
    kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_STATE, n_init=10)
    clusters = kmeans.fit_predict(embeddings)

    overall_terms, cluster_terms = top_tfidf_terms(texts, clusters, np, TfidfVectorizer)
    topic_names = make_topic_names(cluster_terms)

    print("Calculating nearest semantic neighbors...")
    nn = NearestNeighbors(n_neighbors=6, metric="cosine")
    nn.fit(embeddings)
    _, indices = nn.kneighbors(embeddings)

    neighbor_ids: list[list[str]] = []
    for row_indices in indices:
        # First result is the passage itself.
        neighbor_ids.append([passages[i]["passage_id"] for i in row_indices[1:6]])

    return clusters, coords, topic_names, neighbor_ids, overall_terms, cluster_terms


# Export and findings
def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_matrix(passages: list[dict]) -> list[dict]:
    counts = Counter((p["section"], p["cluster_name"]) for p in passages)
    section_totals = Counter(p["section"] for p in passages)

    rows = []
    for (section, topic), count in sorted(counts.items()):
        rows.append(
            {
                "section": section,
                "cluster_name": topic,
                "count": count,
                "proportion": round(count / section_totals[section], 4),
            }
        )
    return rows


def short(text: str, n: int = 150) -> str:
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"



def export_all(passages, raw_count, clusters, coords, topic_names, neighbor_ids, overall_terms, cluster_terms) -> None:

    for i, p in enumerate(passages):
        cluster = int(clusters[i])
        p["cluster"] = cluster
        p["cluster_name"] = topic_names[cluster]
        p["x"] = round(float(coords[i, 0]), 6)
        p["y"] = round(float(coords[i, 1]), 6)
        p["neighbors"] = neighbor_ids[i]

    # Clean passage table requested by the assignment.
    write_csv(
        PASSAGES_PATH,
        passages,
        ["passage_id", "chapter", "section", "subsection", "page", "text", "word_count",
         "cluster", "cluster_name", "x", "y", "neighbors"],
    )

    # Visualization-ready semantic map. Keep neighbors compact in the CSV.
    map_rows = []
    for p in passages:
        row = dict(p)
        row["neighbors"] = "|".join(p["neighbors"])
        map_rows.append(row)
    write_csv(
        MAP_PATH,
        map_rows,
        ["passage_id", "chapter", "section", "subsection", "page", "text", "word_count",
         "cluster", "cluster_name", "x", "y", "neighbors"],
    )

    matrix_rows = build_matrix(passages)
    write_csv(MATRIX_PATH, matrix_rows, ["section", "cluster_name", "count", "proportion"])


    section_counts = Counter(p["section"] for p in passages)
    avg_by_section = {}
    for section in section_counts:
        values = [p["word_count"] for p in passages if p["section"] == section]
        avg_by_section[section] = round(sum(values) / len(values), 1)

    summary = {
        "bulletin": {
            "title": "Bulletin of Duke Kunshan University Undergraduate Instruction",
            "version": "2021-2022",
            "source": PDF_URL,
            "date_accessed": date.today().isoformat(),
        },
        "corpus": {
            "raw_passages": raw_count,
            "cleaned_passages": len(passages),
            "average_passage_length": round(
                sum(p["word_count"] for p in passages) / len(passages), 1
            ),
            "formal_sections": len(section_counts),
        },
        "methods": {
            "embedding_model": MODEL_NAME,
            "umap": "n_neighbors=15, min_dist=0.15, metric=cosine, random_state=401",
            "clustering": f"KMeans, k={N_CLUSTERS}, random_state=401, n_init=10",
        },
        "top_terms": overall_terms,
        "passages_by_section": dict(section_counts.most_common()),
        "average_length_by_section": avg_by_section,
        "topics": [
            {
                "cluster": cluster,
                "name": topic_names[cluster],
                "top_terms": cluster_terms[cluster],
                "count": sum(1 for p in passages if p["cluster"] == cluster),
            }
            for cluster in sorted(topic_names)
        ],
    }

    with SUMMARY_PATH.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    with REPORT_PATH.open("w", encoding="utf-8") as f:
        for cluster in sorted(topic_names):
            f.write(f"CLUSTER {cluster}: {topic_names[cluster]}\n")
            f.write("Top TF-IDF terms: " + ", ".join(cluster_terms[cluster]) + "\n")
            examples = [p for p in passages if p["cluster"] == cluster][:5]
            for p in examples:
                f.write(f"- [{p['section']}, p. {p['page']}] {p['text']}\n")
            f.write("\n")


# Main
def main() -> None:
    download_pdf()

    print("Extracting and cleaning passages...")
    passages, raw_count = extract_passages()
    if not passages:
        raise RuntimeError("No passages were extracted from the bulletin.")

    print(f"Raw text blocks: {raw_count}")
    print(f"Cleaned passages: {len(passages)}")

    clusters, coords, topic_names, neighbor_ids, overall_terms, cluster_terms = semantic_analysis(passages)
    export_all(
        passages,
        raw_count,
        clusters,
        coords,
        topic_names,
        neighbor_ids,
        overall_terms,
        cluster_terms,
    )

    print("\nFinished. Generated files in ../data/:")
    for path in [PASSAGES_PATH, MAP_PATH, MATRIX_PATH, SUMMARY_PATH, REPORT_PATH]:
        print(f"  - {path.name}")


if __name__ == "__main__":
    main()
