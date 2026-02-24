"""
Test suite for URGENT fixes in Interview Copilot v15
Tests:
1. Whisper model = tiny (not small/medium)
2. beam_size=1 configured for speed
3. WHISPER_MIN_SECONDS=0.5 for quick response
4. max_tokens=300 in LLM calls
5. Small talk filtering: 'okay', 'hmm' return False in detect_request
6. Real questions return True with confidence >= 0.6
7. Health check returns ok
"""
import pytest
import requests
import os
import sys

# Add backend to path for direct imports
sys.path.insert(0, '/app/backend')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://jwt-interview.preview.emergentagent.com')

class TestHealthCheck:
    """Verify backend health endpoint"""
    
    def test_health_returns_ok(self):
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        assert "version" in data
        print(f"✓ Health check: {data}")


class TestWhisperConfiguration:
    """Verify Whisper model is configured for speed"""
    
    def test_whisper_model_is_tiny(self):
        """URGENT: Whisper model should be 'tiny' for faster transcription"""
        from server import WHISPER_MODEL_SIZE
        assert WHISPER_MODEL_SIZE == "tiny", f"Expected 'tiny', got '{WHISPER_MODEL_SIZE}'"
        print(f"✓ WHISPER_MODEL_SIZE = '{WHISPER_MODEL_SIZE}'")
    
    def test_whisper_min_seconds_is_half(self):
        """URGENT: WHISPER_MIN_SECONDS should be 0.5 for quick response"""
        from server import WHISPER_MIN_SECONDS
        assert WHISPER_MIN_SECONDS == 0.5, f"Expected 0.5, got {WHISPER_MIN_SECONDS}"
        print(f"✓ WHISPER_MIN_SECONDS = {WHISPER_MIN_SECONDS}")
    
    def test_transcribe_interval_is_half(self):
        """URGENT: TRANSCRIBE_INTERVAL should be 0.5 for quick response"""
        from server import TRANSCRIBE_INTERVAL
        assert TRANSCRIBE_INTERVAL == 0.5, f"Expected 0.5, got {TRANSCRIBE_INTERVAL}"
        print(f"✓ TRANSCRIBE_INTERVAL = {TRANSCRIBE_INTERVAL}")


class TestBeamSizeConfiguration:
    """Verify beam_size=1 in transcribe call"""
    
    def test_beam_size_in_code(self):
        """URGENT: beam_size=1 should be in server.py transcribe call"""
        with open('/app/backend/server.py', 'r') as f:
            content = f.read()
        assert 'beam_size=1' in content, "beam_size=1 not found in server.py"
        assert 'best_of=1' in content, "best_of=1 not found in server.py"
        assert 'without_timestamps=True' in content, "without_timestamps=True not found"
        print("✓ beam_size=1, best_of=1, without_timestamps=True found in code")


class TestMaxTokensConfiguration:
    """Verify max_tokens=300 for streaming suggestions"""
    
    def test_max_tokens_default_is_300(self):
        """max_tokens should be 300 in llm_chat default"""
        from server import llm_chat
        import inspect
        sig = inspect.signature(llm_chat)
        max_tokens_default = sig.parameters['max_tokens'].default
        assert max_tokens_default == 300, f"Expected 300, got {max_tokens_default}"
        print(f"✓ llm_chat max_tokens default = {max_tokens_default}")
    
    def test_streaming_max_tokens_is_300(self):
        """Verify max_tokens=300 in stream_llm_suggestions"""
        with open('/app/backend/server.py', 'r') as f:
            content = f.read()
        # Check stream_llm_suggestions function
        assert 'max_tokens=300' in content, "max_tokens=300 not found in server.py"
        print("✓ max_tokens=300 found in streaming code")


class TestSmallTalkFiltering:
    """Test strict small talk filtering"""
    
    @pytest.mark.parametrize("small_talk", [
        "okay", "ok", "hmm", "uh", "um",
        "yes", "yeah", "no", "nope",
        "thanks", "thank you",
        "bonjour", "hello", "hi",
        "d'accord", "oui", "non", "merci",
        "good", "great", "sure"
    ])
    def test_small_talk_returns_false(self, small_talk):
        """STRICT: Small talk should return False in detect_request"""
        from server import detect_request
        result = detect_request(small_talk)
        assert result == False, f"detect_request('{small_talk}') should be False, got {result}"
        print(f"✓ detect_request('{small_talk}') = {result}")
    
    def test_min_4_words_requirement(self):
        """detect_request requires minimum 4 words"""
        from server import detect_request
        # Less than 4 words should return False
        assert detect_request("tell me") == False
        assert detect_request("what is") == False
        print("✓ Less than 4 words returns False")


class TestRealQuestionDetection:
    """Test real questions return True with confidence >= 0.6"""
    
    @pytest.mark.parametrize("question", [
        "What is your experience with Python programming?",
        "Comment avez-vous géré ce projet difficile?",
        "Why did you choose this technology stack?",
        "Tell me about your biggest professional achievement?",
        "Can you explain your approach to code testing?",
        "How would you handle a conflict with a coworker?"
    ])
    def test_real_question_returns_true(self, question):
        """Real questions should return True"""
        from server import detect_request, calculate_confidence, CONFIDENCE_THRESHOLD
        result = detect_request(question)
        confidence = calculate_confidence(question)
        assert result == True, f"detect_request('{question[:30]}...') should be True"
        assert confidence >= CONFIDENCE_THRESHOLD, f"Confidence {confidence} < threshold {CONFIDENCE_THRESHOLD}"
        print(f"✓ Question detected: conf={confidence:.2f}")


class TestConfidenceThreshold:
    """Test CONFIDENCE_THRESHOLD is 0.6"""
    
    def test_confidence_threshold_is_06(self):
        """STRICT: CONFIDENCE_THRESHOLD should be 0.6"""
        from server import CONFIDENCE_THRESHOLD
        assert CONFIDENCE_THRESHOLD == 0.6, f"Expected 0.6, got {CONFIDENCE_THRESHOLD}"
        print(f"✓ CONFIDENCE_THRESHOLD = {CONFIDENCE_THRESHOLD}")
    
    def test_question_mark_boosts_confidence(self):
        """Question mark should boost confidence"""
        from server import calculate_confidence
        without_mark = calculate_confidence("Tell me about your experience")
        with_mark = calculate_confidence("Tell me about your experience?")
        assert with_mark > without_mark, "Question mark should increase confidence"
        print(f"✓ Without ?: {without_mark:.2f}, With ?: {with_mark:.2f}")


class TestAPIEndpoints:
    """Test API endpoints work correctly"""
    
    def test_settings_endpoint(self):
        """Settings endpoint should return valid structure"""
        response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert "server_storage" in data
        print(f"✓ Settings endpoint works: {data}")
    
    def test_ingestion_status(self):
        """Ingestion status endpoint should work"""
        response = requests.get(f"{BASE_URL}/api/ingestion/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        assert "doc_count" in data
        print(f"✓ Ingestion status: available={data.get('available')}, docs={data.get('doc_count')}")
    
    def test_active_cv_endpoint(self):
        """Active CV endpoint should work"""
        response = requests.get(f"{BASE_URL}/api/cv/active", timeout=10)
        assert response.status_code in [200, 204]
        print(f"✓ Active CV endpoint works (status {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
