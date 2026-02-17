from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

VECTOR_DIR = Path(__file__).resolve().parent / "data" / "vector_store"
INDEX_PATH = VECTOR_DIR / "profile.index"
META_PATH = VECTOR_DIR / "profile_meta.json"
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"

_embedder: Optional[SentenceTransformer] = None


def get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBED_MODEL_NAME)
    return _embedder


def ensure_vector_dir() -> None:
    VECTOR_DIR.mkdir(parents=True, exist_ok=True)


def build_index(texts: List[str]):
    model = get_embedder()
    embeddings = model.encode(texts, normalize_embeddings=True)
    embeddings = np.array(embeddings).astype("float32")
    dim = embeddings.shape[1]

    if len(texts) > 500:
        nlist = min(64, max(8, int(np.sqrt(len(texts)))))
        quantizer = faiss.IndexFlatIP(dim)
        index = faiss.IndexIVFPQ(quantizer, dim, nlist, 8, 8)
        index.train(embeddings)
        index.add(embeddings)
        index.nprobe = min(16, nlist)
    else:
        index = faiss.IndexFlatIP(dim)
        index.add(embeddings)

    return index


def save_profile_index(documents: List[Dict], metadata: Dict) -> Dict:
    if not documents:
        raise ValueError("No documents provided for index")

    ensure_vector_dir()
    texts = [doc["text"] for doc in documents]
    index = build_index(texts)
    faiss.write_index(index, str(INDEX_PATH))

    meta = {
        **metadata,
        "doc_count": len(documents),
        "created_at": datetime.utcnow().isoformat(),
        "documents": documents
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    return meta


def load_profile_meta() -> Optional[Dict]:
    if not META_PATH.exists():
        return None
    return json.loads(META_PATH.read_text())


def profile_index_exists() -> bool:
    return INDEX_PATH.exists() and META_PATH.exists()


def search_profile_context(query: str, k: int = 5) -> List[Dict]:
    if not profile_index_exists():
        return []

    meta = load_profile_meta() or {}
    documents = meta.get("documents", [])
    if not documents:
        return []

    index = faiss.read_index(str(INDEX_PATH))
    model = get_embedder()
    query_vec = model.encode([query], normalize_embeddings=True)
    query_vec = np.array(query_vec).astype("float32")

    k = min(k, len(documents))
    scores, indices = index.search(query_vec, k)

    results = []
    for idx in indices[0]:
        if idx < 0:
            continue
        results.append(documents[idx])
    return results


def clear_profile_cache() -> List[str]:
    removed = []
    if INDEX_PATH.exists():
        INDEX_PATH.unlink()
        removed.append(str(INDEX_PATH))
    if META_PATH.exists():
        META_PATH.unlink()
        removed.append(str(META_PATH))
    return removed
