"""
Pydantic Models
Data validation and serialization models.
"""
from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class LLMHeaders(BaseModel):
    """LLM provider configuration."""
    provider: str
    model: str
    api_key: str


class SettingsInput(BaseModel):
    """User settings input."""
    provider: str
    model: str
    api_key: str
    temperature: float = 0.5
    max_tokens: int = 1200
    transcription_model: str = "whisper-1"


class SessionCreate(BaseModel):
    """Session creation request."""
    title: Optional[str] = None
    target_role: Optional[str] = None
    job_description: Optional[str] = None


class SessionUpdate(BaseModel):
    """Session update request."""
    status: Optional[str] = None
    duration_seconds: Optional[int] = None
    title: Optional[str] = None


class CVUploadResponse(BaseModel):
    """CV upload response."""
    success: bool
    message: str
    cv_id: Optional[str] = None
    full_name: Optional[str] = None


class TranscriptRequest(BaseModel):
    """Transcript generation request."""
    question: str


class FollowUpRequest(BaseModel):
    """Follow-up question request."""
    session_id: str
    candidate_response: str


class ChronologyRequest(BaseModel):
    """Chronology sorting request."""
    experiences: List[Dict]
    reverse: bool = True


class ProfileBuildRequest(BaseModel):
    """Profile build request."""
    job_description: str
    company_name: str
    target_role: Optional[str] = None


class SummaryRequest(BaseModel):
    """Summary generation request."""
    length: str = "medium"
    format: str = "structured"


class IngestionStatusResponse(BaseModel):
    """Ingestion status response."""
    available: bool
    cv_loaded: bool
    profile_indexed: bool
    doc_count: int
    last_updated: Optional[str] = None
