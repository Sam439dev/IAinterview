"""
Services Package
Contains business logic services for the Interview Copilot.
"""
from services.llm_service import llm_chat, llm_chat_fast
from services.chronology_service import (
    parse_date_string,
    sort_experiences_chronologically,
    calculate_experience_freshness,
    get_missing_date_experiences
)
from services.detection_service import (
    detect_request,
    calculate_confidence,
    is_request_above_threshold,
    estimate_speaker
)

__all__ = [
    'llm_chat',
    'llm_chat_fast',
    'parse_date_string',
    'sort_experiences_chronologically',
    'calculate_experience_freshness',
    'get_missing_date_experiences',
    'detect_request',
    'calculate_confidence',
    'is_request_above_threshold',
    'estimate_speaker'
]
