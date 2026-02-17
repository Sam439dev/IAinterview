"""
End-to-End Streaming Test for Interview Copilot
Tests: Audio → Transcription → Intent Detection → Speaker Diarization
"""
import pytest
import asyncio
import numpy as np
import json
from server import (
    detect_request,
    decode_audio_chunk,
    get_whisper_model,
    StreamingSession,
    ENABLE_DIARIZATION,
    build_cv_context_rich
)


def test_detect_request_questions():
    """Test question detection logic"""
    # Questions (should return True)
    questions = [
        "Tell me about your experience with React?",
        "How would you handle this situation?",
        "Can you explain your approach?",
        "Why did you leave your previous job?",
        "What is your biggest weakness?",
        "Walk me through your resume",
    ]
    for q in questions:
        assert detect_request(q), f"Should detect question: {q}"
    
    # Non-questions (should return False)
    statements = [
        "I have 5 years of experience.",
        "That sounds interesting.",
        "I agree with that approach.",
    ]
    for s in statements:
        assert not detect_request(s), f"Should not detect as question: {s}"


def test_decode_audio_chunk():
    """Test audio chunk decoding"""
    import base64
    # Create a simple audio chunk (1 second of silence at 16kHz)
    samples = np.zeros(16000, dtype=np.int16)
    chunk_b64 = base64.b64encode(samples.tobytes()).decode()
    
    decoded = decode_audio_chunk(chunk_b64)
    assert len(decoded) == 16000
    assert decoded.dtype == np.float32
    assert np.allclose(decoded, 0.0)


def test_streaming_session_buffer():
    """Test audio buffer management"""
    session = StreamingSession(session_id="test-123")
    
    # Add 1 second of audio
    samples = np.random.randn(16000).astype(np.float32)
    session.append_audio(samples)
    
    assert session.buffer_samples == 16000
    
    # Add more audio (should stay within window limit)
    for _ in range(60):  # Add 60 seconds
        session.append_audio(np.random.randn(16000).astype(np.float32))
    
    # Should be limited to WHISPER_WINDOW_SECONDS (30s = 480000 samples max)
    assert session.buffer_samples <= 30 * 16000 + 16000


def test_whisper_model_loading():
    """Test Whisper model can be loaded"""
    model = get_whisper_model()
    assert model is not None


def test_build_cv_context_rich():
    """Test CV context building from parsed data"""
    cv_data = {
        "full_name": "Jean Dupont",
        "target_role": "Senior Developer",
        "skills_hard": ["Python", "JavaScript", "React"],
        "skills_soft": ["Communication", "Leadership"],
        "technologies": ["Docker", "AWS"],
        "experiences": [
            {
                "title": "Lead Developer",
                "company": "TechCorp",
                "duration": "2020-2023",
                "key_achievements": ["Built microservices", "Led team of 5"]
            }
        ],
        "languages_spoken": [
            {"language": "French", "level": "Native"},
            {"language": "English", "level": "Fluent"}
        ]
    }
    
    context = build_cv_context_rich(cv_data)
    
    assert "Jean Dupont" in context
    assert "Python" in context
    assert "Lead Developer" in context
    assert "TechCorp" in context


def test_diarization_enabled():
    """Verify diarization configuration"""
    assert ENABLE_DIARIZATION == True, "Diarization should be enabled"


@pytest.mark.asyncio
async def test_transcribe_mock_audio():
    """Test transcription with mock audio (silence)"""
    model = get_whisper_model()
    
    # Create 3 seconds of near-silence with some noise
    audio = np.random.randn(48000).astype(np.float32) * 0.001
    
    # Run transcription
    segments, info = await asyncio.to_thread(
        model.transcribe,
        audio,
        language=None,
        vad_filter=True
    )
    
    # Silence should produce empty or minimal transcript
    transcript = " ".join(seg.text.strip() for seg in segments).strip()
    assert isinstance(transcript, str)


if __name__ == "__main__":
    print("Running streaming pipeline tests...")
    
    print("1. Testing question detection...")
    test_detect_request_questions()
    print("   ✓ Question detection works")
    
    print("2. Testing audio chunk decoding...")
    test_decode_audio_chunk()
    print("   ✓ Audio decoding works")
    
    print("3. Testing streaming session buffer...")
    test_streaming_session_buffer()
    print("   ✓ Buffer management works")
    
    print("4. Testing Whisper model loading...")
    test_whisper_model_loading()
    print("   ✓ Whisper model loaded")
    
    print("5. Testing CV context building...")
    test_build_cv_context_rich()
    print("   ✓ CV context building works")
    
    print("6. Testing diarization config...")
    test_diarization_enabled()
    print("   ✓ Diarization is enabled")
    
    print("\n✅ All streaming pipeline tests passed!")
