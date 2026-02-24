"""
Utility Functions
Serializers, helpers, and common utilities.
"""
import json
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any


def serialize_mongo_doc(doc: Dict) -> Dict:
    """Serialize a MongoDB document for JSON response."""
    if not doc:
        return {}
    d = dict(doc)
    if '_id' in d:
        d['id'] = str(d.pop('_id'))
    return d


def serialize_mongo_list(docs: List[Dict]) -> List[Dict]:
    """Serialize a list of MongoDB documents."""
    return [serialize_mongo_doc(d) for d in docs]


def now_utc() -> str:
    """Get current UTC timestamp as ISO string."""
    return datetime.now(timezone.utc).isoformat()


def safe_json_loads(raw_text: str) -> Optional[Dict]:
    """
    Safely parse JSON from text, handling common LLM output issues.
    Attempts to extract JSON from markdown code blocks if present.
    """
    if not raw_text:
        return None
    
    text = raw_text.strip()
    
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Try extracting from markdown code blocks
    patterns = [
        r'```json\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
        r'\{[\s\S]*\}'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                json_str = match.group(1) if '```' in pattern else match.group(0)
                return json.loads(json_str)
            except (json.JSONDecodeError, IndexError):
                continue
    
    return None


def truncate_text(text: str, max_length: int = 1000, suffix: str = "...") -> str:
    """Truncate text to max_length with suffix."""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def clean_text(text: str) -> str:
    """Clean and normalize text."""
    if not text:
        return ""
    # Remove multiple whitespaces
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def get_mime_extension(mime_type: str) -> str:
    """Get file extension from MIME type."""
    ext_map = {
        "audio/webm": "webm",
        "audio/wav": "wav",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/ogg": "ogg",
        "audio/m4a": "m4a"
    }
    return ext_map.get(mime_type, "webm")


def is_valid_session_id(session_id: str) -> bool:
    """Validate session ID format."""
    if not session_id:
        return False
    # MongoDB ObjectId format or UUID format
    return bool(re.match(r'^[a-f0-9]{24}$|^[a-f0-9-]{36}$', session_id.lower()))


def normalize_provider(provider: str) -> str:
    """Normalize LLM provider name."""
    return provider.strip().lower()


def format_duration(seconds: int) -> str:
    """Format duration in seconds to human-readable string."""
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    remaining = seconds % 60
    if minutes < 60:
        return f"{minutes}m {remaining}s"
    hours = minutes // 60
    remaining_mins = minutes % 60
    return f"{hours}h {remaining_mins}m"
