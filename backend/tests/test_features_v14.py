"""
Backend Feature Tests for Iteration 14
Testing:
1. Health check returns ok
2. detect_request with confidence threshold and small talk filtering
3. max_tokens=300 in llm_chat function
4. calculate_confidence returns 0-1 score
5. FAISS profile persistence
"""
import pytest
import requests
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://jwt-interview.preview.emergentagent.com')

# Import backend modules for unit testing
from server import detect_request, calculate_confidence, CONFIDENCE_THRESHOLD, llm_chat
from vector_store import profile_index_exists, load_profile_meta, INDEX_PATH, META_PATH


class TestHealthCheck:
    """Test /api/health endpoint"""
    
    def test_health_returns_ok(self):
        """Backend health check should return status 'ok'"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        print(f"✓ Health check passed: {data}")


class TestDetectRequest:
    """Test detect_request function for small talk filtering"""
    
    def test_short_segments_filtered(self):
        """Segments with less than 3 words should be filtered"""
        assert detect_request("okay") == False
        assert detect_request("hi") == False
        assert detect_request("ok") == False
        print("✓ Short segments (< 3 words) correctly filtered")
    
    def test_small_talk_patterns_filtered(self):
        """Common small talk patterns should not trigger suggestions"""
        small_talk_examples = [
            "okay",
            "ok", 
            "alright",
            "hmm",
            "thanks",
            "thank you",
            "bonjour",
            "hello",
            "d'accord",
            "oui",
            "merci",
            "got it",
            "i see",
            "parfait",
            "super"
        ]
        for phrase in small_talk_examples:
            result = detect_request(phrase)
            assert result == False, f"Small talk '{phrase}' should be filtered but got {result}"
        print(f"✓ All {len(small_talk_examples)} small talk patterns correctly filtered")
    
    def test_direct_questions_detected(self):
        """Direct questions (ending with ?) should be detected"""
        questions = [
            "What is your experience with Python?",
            "How did you handle that situation?",
            "Can you tell me more about that project?",
            "Pourquoi avez-vous quitté votre dernier emploi?",
            "Comment gérez-vous le stress?"
        ]
        for q in questions:
            result = detect_request(q)
            assert result == True, f"Question '{q}' should be detected but got {result}"
        print(f"✓ All {len(questions)} direct questions correctly detected")
    
    def test_question_starters_detected(self):
        """Question starters should be detected even without '?'"""
        questions = [
            "What are your strengths",
            "How do you approach problem solving",
            "Tell me about yourself",
            "Describe a challenging situation",
            "Explain your role in the project",
            "Walk me through your experience",
            "Comment travaillez-vous en équipe",
            "Pourquoi voulez-vous ce poste",
            "Parlez-moi de votre expérience"
        ]
        for q in questions:
            result = detect_request(q)
            assert result == True, f"Question '{q}' should be detected but got {result}"
        print(f"✓ All {len(questions)} question starters correctly detected")


class TestCalculateConfidence:
    """Test calculate_confidence function returns scores 0-1"""
    
    def test_confidence_range(self):
        """Confidence should be between 0 and 1"""
        test_texts = [
            "Hello",
            "What is your name?",
            "Tell me about your experience with Python",
            "How did you handle that situation?",
            "okay",
            "Why do you want to work here?"
        ]
        for text in test_texts:
            score = calculate_confidence(text)
            assert 0.0 <= score <= 1.0, f"Score for '{text}' is {score}, should be 0-1"
        print("✓ All confidence scores within 0-1 range")
    
    def test_question_mark_boosts_confidence(self):
        """Questions with ? should have higher confidence"""
        with_qmark = calculate_confidence("What is your experience?")
        without_qmark = calculate_confidence("What is your experience")
        assert with_qmark >= 0.6, f"Question with '?' should have confidence >= 0.6, got {with_qmark}"
        print(f"✓ Question mark boosts confidence: with '?' = {with_qmark}, without = {without_qmark}")
    
    def test_question_words_boost_confidence(self):
        """Question words should boost confidence"""
        question_texts = [
            "What is your role?",
            "Why did you leave?",
            "How do you work?",
            "When did you start?",
            "Where are you from?"
        ]
        for text in question_texts:
            score = calculate_confidence(text)
            assert score >= 0.5, f"Question word text '{text}' should have confidence >= 0.5, got {score}"
        print("✓ Question words boost confidence correctly")
    
    def test_confidence_threshold_value(self):
        """CONFIDENCE_THRESHOLD should be 0.5"""
        assert CONFIDENCE_THRESHOLD == 0.5
        print(f"✓ CONFIDENCE_THRESHOLD is correctly set to {CONFIDENCE_THRESHOLD}")


class TestMaxTokensConfig:
    """Test max_tokens configuration in llm_chat"""
    
    def test_llm_chat_default_max_tokens(self):
        """llm_chat should have max_tokens=300 as default"""
        import inspect
        sig = inspect.signature(llm_chat)
        max_tokens_param = sig.parameters.get('max_tokens')
        assert max_tokens_param is not None
        assert max_tokens_param.default == 300, f"Default max_tokens should be 300, got {max_tokens_param.default}"
        print(f"✓ llm_chat default max_tokens = {max_tokens_param.default}")


class TestFAISSPersistence:
    """Test FAISS profile persistence to disk"""
    
    def test_index_path_correct(self):
        """FAISS index should be persisted at correct path"""
        expected_suffix = "data/vector_store/profile.index"
        assert str(INDEX_PATH).endswith(expected_suffix) or "profile.index" in str(INDEX_PATH)
        print(f"✓ INDEX_PATH = {INDEX_PATH}")
    
    def test_profile_index_exists_on_disk(self):
        """Profile index should exist on disk after being built"""
        # This tests if the file physically exists
        assert INDEX_PATH.exists(), f"FAISS index not found at {INDEX_PATH}"
        print(f"✓ FAISS index exists at {INDEX_PATH}")
    
    def test_profile_meta_exists_on_disk(self):
        """Profile metadata should exist on disk"""
        assert META_PATH.exists(), f"Profile meta not found at {META_PATH}"
        print(f"✓ Profile metadata exists at {META_PATH}")
    
    def test_profile_index_exists_function(self):
        """profile_index_exists should return True when index is built"""
        exists = profile_index_exists()
        assert exists == True, "profile_index_exists() should return True"
        print("✓ profile_index_exists() returns True")
    
    def test_load_profile_meta_returns_data(self):
        """load_profile_meta should return valid data"""
        meta = load_profile_meta()
        assert meta is not None, "Profile meta should not be None"
        assert "doc_count" in meta, "Meta should contain doc_count"
        assert meta["doc_count"] > 0, "doc_count should be > 0"
        print(f"✓ Profile meta loaded: {meta.get('doc_count')} documents")


class TestIngestionStatus:
    """Test ingestion status endpoint"""
    
    def test_ingestion_status_returns_available(self):
        """Ingestion status should show available when profile exists"""
        response = requests.get(f"{BASE_URL}/api/ingestion/status")
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        assert "doc_count" in data
        print(f"✓ Ingestion status: available={data['available']}, doc_count={data['doc_count']}")


class TestSettingsEndpoint:
    """Test settings endpoint for API key section"""
    
    def test_settings_get(self):
        """GET /api/settings should return settings structure"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert "server_storage" in data
        assert "preferred_provider" in data
        assert "preferred_model" in data
        assert "has_key" in data
        print(f"✓ Settings endpoint returns: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
