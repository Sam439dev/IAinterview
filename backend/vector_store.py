"""
Vector Store - API-based implementation for Emergent deployment.
Uses OpenAI Embeddings API instead of local sentence-transformers.
Uses cosine similarity search instead of FAISS.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
import os

import httpx

VECTOR_DIR = Path(__file__).resolve().parent / "data" / "vector_store"
META_PATH = VECTOR_DIR / "profile_meta.json"
EMBEDDINGS_PATH = VECTOR_DIR / "embeddings.json"

# OpenAI embedding model (small and fast)
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


def ensure_vector_dir() -> None:
    VECTOR_DIR.mkdir(parents=True, exist_ok=True)


async def get_openai_embeddings(texts: List[str], api_key: str) -> List[List[float]]:
    """Get embeddings from OpenAI API."""
    if not texts:
        return []
    
    # Truncate texts to avoid token limits
    truncated = [t[:8000] for t in texts]
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": EMBEDDING_MODEL,
                "input": truncated
            }
        )
        
        if response.status_code != 200:
            print(f"[EMBEDDINGS] Error: {response.status_code} - {response.text[:200]}")
            return []
        
        data = response.json()
        embeddings = [item["embedding"] for item in data["data"]]
        return embeddings


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)


def save_profile_index(documents: List[Dict], metadata: Dict, embeddings: List[List[float]] = None) -> Dict:
    """Save profile index with pre-computed embeddings."""
    if not documents:
        raise ValueError("No documents provided for index")

    ensure_vector_dir()
    
    meta = {
        **metadata,
        "doc_count": len(documents),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "documents": documents
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    
    # Save embeddings separately if provided
    if embeddings:
        EMBEDDINGS_PATH.write_text(json.dumps(embeddings))
    
    return meta


async def save_profile_index_async(documents: List[Dict], metadata: Dict, api_key: str) -> Dict:
    """Save profile index with embeddings computed via OpenAI API."""
    if not documents:
        raise ValueError("No documents provided for index")
    
    ensure_vector_dir()
    
    # Get embeddings for all documents
    texts = [doc.get("text", "")[:8000] for doc in documents]
    embeddings = await get_openai_embeddings(texts, api_key)
    
    meta = {
        **metadata,
        "doc_count": len(documents),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "documents": documents
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    
    if embeddings:
        EMBEDDINGS_PATH.write_text(json.dumps(embeddings))
    
    return meta


def load_profile_meta() -> Optional[Dict]:
    if not META_PATH.exists():
        return None
    return json.loads(META_PATH.read_text())


def load_embeddings() -> Optional[List[List[float]]]:
    if not EMBEDDINGS_PATH.exists():
        return None
    return json.loads(EMBEDDINGS_PATH.read_text())


def profile_index_exists() -> bool:
    return META_PATH.exists()


def search_profile_context(query: str, k: int = 5) -> List[Dict]:
    """
    Search profile context using simple text matching.
    For full vector search, use search_profile_context_async with API key.
    """
    if not profile_index_exists():
        return []

    meta = load_profile_meta() or {}
    documents = meta.get("documents", [])
    if not documents:
        return []
    
    # Simple keyword-based fallback search
    query_lower = query.lower()
    query_words = set(query_lower.split())
    
    scored_docs = []
    for doc in documents:
        text = doc.get("text", "").lower()
        # Score based on word overlap
        text_words = set(text.split())
        overlap = len(query_words & text_words)
        if overlap > 0:
            scored_docs.append((overlap, doc))
    
    # Sort by score and return top k
    scored_docs.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored_docs[:k]]


async def search_profile_context_async(query: str, api_key: str, k: int = 5) -> List[Dict]:
    """Search profile context using OpenAI embeddings for semantic search."""
    if not profile_index_exists():
        return []

    meta = load_profile_meta() or {}
    documents = meta.get("documents", [])
    embeddings = load_embeddings()
    
    if not documents:
        return []
    
    # If no embeddings, fall back to keyword search
    if not embeddings or len(embeddings) != len(documents):
        return search_profile_context(query, k)
    
    # Get query embedding
    query_embeddings = await get_openai_embeddings([query], api_key)
    if not query_embeddings:
        return search_profile_context(query, k)
    
    query_vec = query_embeddings[0]
    
    # Calculate similarities
    scored_docs = []
    for i, (doc, emb) in enumerate(zip(documents, embeddings)):
        similarity = cosine_similarity(query_vec, emb)
        scored_docs.append((similarity, doc))
    
    # Sort by similarity and return top k
    scored_docs.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored_docs[:k]]


def clear_profile_cache() -> List[str]:
    removed = []
    if EMBEDDINGS_PATH.exists():
        EMBEDDINGS_PATH.unlink()
        removed.append(str(EMBEDDINGS_PATH))
    if META_PATH.exists():
        META_PATH.unlink()
        removed.append(str(META_PATH))
    return removed
