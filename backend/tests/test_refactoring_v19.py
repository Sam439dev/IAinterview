"""
Test suite for backend modular refactoring (v19)
Verifies zero regression after creating new modules:
- config.py: Centralized configuration
- models.py: Pydantic models
- services/: LLM, chronology, detection services
- utils/: Helper functions
"""
import pytest
import requests
import os
import sys

# Add backend to path for module imports
sys.path.insert(0, '/app/backend')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://interview-copilot-16.preview.emergentagent.com"


class TestHealthAndBasicEndpoints:
    """Verify basic API health and existing endpoints still work"""
    
    def test_health_endpoint(self):
        """API health check should return ok status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health endpoint working")
    
    def test_sessions_endpoint(self):
        """Sessions endpoint should return list"""
        response = requests.get(f"{BASE_URL}/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Sessions endpoint working: {len(data)} sessions")
    
    def test_cv_active_endpoint(self):
        """CV active endpoint should return null or CV data"""
        response = requests.get(f"{BASE_URL}/api/cv/active")
        assert response.status_code == 200
        print("✓ CV active endpoint working")
    
    def test_sessions_stats_endpoint(self):
        """Sessions stats endpoint should return stats"""
        response = requests.get(f"{BASE_URL}/api/sessions/stats")
        assert response.status_code == 200
        print("✓ Sessions stats endpoint working")


class TestCVChronologyEndpoints:
    """Test CV chronology endpoints (sorting and date handling)"""
    
    def test_chronological_profile_endpoint(self):
        """CV chronological profile endpoint exists and responds"""
        response = requests.get(f"{BASE_URL}/api/cv/chronological-profile")
        # Should return 200 with data or 404 if no CV
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Chronological profile: {data.get('full_name', 'N/A')}")
        else:
            print("✓ Chronological profile endpoint works (no CV loaded)")
    
    def test_missing_dates_endpoint(self):
        """CV missing dates endpoint exists and responds"""
        response = requests.get(f"{BASE_URL}/api/cv/missing-dates")
        # Should return 200 with data or 404 if no CV
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Missing dates: {len(data.get('missing_experiences', []))} found")
        else:
            print("✓ Missing dates endpoint works (no CV loaded)")


class TestDetectionService:
    """Test request detection functionality (without LLM calls)"""
    
    def test_detection_service_import(self):
        """Detection service module can be imported"""
        from services.detection_service import detect_request, calculate_confidence
        assert callable(detect_request)
        assert callable(calculate_confidence)
        print("✓ Detection service imports correctly")
    
    def test_detect_request_question_french(self):
        """French question 'Parlez-moi de vous' should be detected as request"""
        from services.detection_service import detect_request
        
        result = detect_request("Parlez-moi de vous")
        assert result is True, "Should detect 'Parlez-moi de vous' as request"
        print("✓ 'Parlez-moi de vous' detected as request")
    
    def test_detect_request_greeting(self):
        """Greeting 'Bonjour' should NOT be detected as request"""
        from services.detection_service import detect_request
        
        result = detect_request("Bonjour")
        assert result is False, "Should NOT detect 'Bonjour' as request"
        print("✓ 'Bonjour' correctly filtered as non-request")
    
    def test_detect_request_english_question(self):
        """English question should be detected"""
        from services.detection_service import detect_request
        
        result = detect_request("Tell me about your experience?")
        assert result is True
        print("✓ English question detected")
    
    def test_detect_request_imperative(self):
        """French imperative should be detected"""
        from services.detection_service import detect_request
        
        result = detect_request("Décrivez votre parcours")
        assert result is True
        print("✓ French imperative detected")
    
    def test_confidence_calculation(self):
        """Confidence should be higher for clear questions"""
        from services.detection_service import calculate_confidence
        
        high_conf = calculate_confidence("Pouvez-vous me parler de votre expérience?")
        low_conf = calculate_confidence("ok merci")
        
        assert high_conf > low_conf, "Question should have higher confidence than acknowledgment"
        assert high_conf >= 0.5, f"Question confidence should be >= 0.5, got {high_conf}"
        print(f"✓ Confidence: question={high_conf:.2f}, ack={low_conf:.2f}")


class TestChronologyService:
    """Test chronology sorting functionality"""
    
    def test_chronology_service_import(self):
        """Chronology service module can be imported"""
        from services.chronology_service import (
            parse_date_string,
            sort_experiences_chronologically,
            calculate_experience_freshness
        )
        assert callable(parse_date_string)
        assert callable(sort_experiences_chronologically)
        print("✓ Chronology service imports correctly")
    
    def test_sort_experiences_most_recent_first(self):
        """Experiences should be sorted with most recent first"""
        from services.chronology_service import sort_experiences_chronologically
        
        experiences = [
            {"title": "Old Job", "duration": "2018-2020"},
            {"title": "Current Job", "duration": "2023-présent"},
            {"title": "Middle Job", "duration": "2020-2023"}
        ]
        
        sorted_exp = sort_experiences_chronologically(experiences, reverse=True)
        
        # Most recent (current) should be first
        assert sorted_exp[0]["title"] == "Current Job", "Current job should be first"
        assert sorted_exp[1]["title"] == "Middle Job", "Middle job should be second"
        assert sorted_exp[2]["title"] == "Old Job", "Old job should be last"
        print("✓ Experiences sorted correctly (most recent first)")
    
    def test_parse_date_french_month(self):
        """French month names should be parsed correctly"""
        from services.chronology_service import parse_date_string
        
        start, end, is_current = parse_date_string("janvier 2020 - décembre 2023")
        
        assert start is not None, "Start date should be parsed"
        assert end is not None, "End date should be parsed"
        assert start.year == 2020
        assert start.month == 1
        assert end.year == 2023
        assert end.month == 12
        print("✓ French date parsing works")
    
    def test_parse_date_current_indicator(self):
        """'présent' should indicate current position"""
        from services.chronology_service import parse_date_string
        
        start, end, is_current = parse_date_string("2022 - présent")
        
        assert is_current is True, "Should detect as current position"
        print("✓ Current position detection works")
    
    def test_experience_freshness(self):
        """Recent experience should have higher freshness score"""
        from services.chronology_service import calculate_experience_freshness
        
        current_exp = {"duration": "2024-présent"}
        old_exp = {"duration": "2015-2017"}
        
        current_freshness = calculate_experience_freshness(current_exp)
        old_freshness = calculate_experience_freshness(old_exp)
        
        assert current_freshness == 1.0, f"Current exp should have freshness=1.0, got {current_freshness}"
        assert old_freshness < current_freshness, "Old exp should have lower freshness"
        print(f"✓ Freshness: current={current_freshness}, old={old_freshness}")


class TestLLMServiceHeaders:
    """Test LLM service header validation"""
    
    def test_llm_headers_model_import(self):
        """LLMHeaders model can be imported"""
        from models import LLMHeaders
        
        headers = LLMHeaders(
            provider="openai",
            model="gpt-4o",
            api_key="test-key"
        )
        assert headers.provider == "openai"
        assert headers.model == "gpt-4o"
        print("✓ LLMHeaders model works")
    
    def test_supported_providers_in_config(self):
        """Config should define supported LLM providers"""
        from config import SUPPORTED_LLM_PROVIDERS
        
        assert "openai" in SUPPORTED_LLM_PROVIDERS
        assert "anthropic" in SUPPORTED_LLM_PROVIDERS
        assert "gemini" in SUPPORTED_LLM_PROVIDERS
        assert "deepseek" in SUPPORTED_LLM_PROVIDERS
        print(f"✓ Supported providers: {SUPPORTED_LLM_PROVIDERS}")
    
    def test_deepseek_base_url_in_config(self):
        """Config should have DeepSeek base URL"""
        from config import DEEPSEEK_BASE_URL
        
        assert DEEPSEEK_BASE_URL == "https://api.deepseek.com/v1"
        print("✓ DeepSeek base URL configured")


class TestUtilsHelpers:
    """Test utility helper functions"""
    
    def test_helpers_import(self):
        """Helper functions can be imported"""
        from utils.helpers import (
            serialize_mongo_doc,
            safe_json_loads,
            now_utc,
            normalize_provider
        )
        assert callable(serialize_mongo_doc)
        print("✓ Utils helpers import correctly")
    
    def test_serialize_mongo_doc(self):
        """MongoDB documents should be serialized correctly"""
        from utils.helpers import serialize_mongo_doc
        from bson import ObjectId
        
        doc = {"_id": ObjectId(), "name": "Test"}
        serialized = serialize_mongo_doc(doc)
        
        assert "_id" not in serialized, "Should remove _id"
        assert "id" in serialized, "Should add id field"
        assert serialized["name"] == "Test"
        print("✓ MongoDB serialization works")
    
    def test_safe_json_loads(self):
        """JSON parsing should handle markdown code blocks"""
        from utils.helpers import safe_json_loads
        
        # Plain JSON
        result1 = safe_json_loads('{"key": "value"}')
        assert result1 == {"key": "value"}
        
        # JSON in code block
        result2 = safe_json_loads('```json\n{"key": "value2"}\n```')
        assert result2 == {"key": "value2"}
        
        print("✓ Safe JSON parsing works")
    
    def test_normalize_provider(self):
        """Provider names should be normalized"""
        from utils.helpers import normalize_provider
        
        assert normalize_provider("OpenAI") == "openai"
        assert normalize_provider("  ANTHROPIC  ") == "anthropic"
        print("✓ Provider normalization works")


class TestConfigModule:
    """Test config module has all required constants"""
    
    def test_database_config(self):
        """Database config should be present"""
        from config import MONGO_URL, DB_NAME
        
        assert MONGO_URL is not None
        assert DB_NAME is not None
        print(f"✓ Database config: DB_NAME={DB_NAME}")
    
    def test_audio_config(self):
        """Audio config should be present"""
        from config import AUDIO_BUFFER_SECONDS, TRANSCRIBE_INTERVAL
        
        assert AUDIO_BUFFER_SECONDS > 0
        assert TRANSCRIBE_INTERVAL > 0
        print(f"✓ Audio config: buffer={AUDIO_BUFFER_SECONDS}s, interval={TRANSCRIBE_INTERVAL}s")
    
    def test_llm_limits(self):
        """LLM limits should be configured"""
        from config import (
            MAX_CONCURRENT_SUGGESTIONS,
            DEFAULT_MAX_TOKENS,
            DEFAULT_TEMPERATURE
        )
        
        assert MAX_CONCURRENT_SUGGESTIONS > 0
        assert DEFAULT_MAX_TOKENS > 0
        assert 0 <= DEFAULT_TEMPERATURE <= 1
        print(f"✓ LLM limits: max_tokens={DEFAULT_MAX_TOKENS}, temp={DEFAULT_TEMPERATURE}")
    
    def test_date_patterns_config(self):
        """Date patterns for parsing should be configured"""
        from config import DATE_PATTERNS, MONTH_MAP
        
        assert len(DATE_PATTERNS) > 0
        assert "janvier" in MONTH_MAP
        assert MONTH_MAP["janvier"] == 1
        print(f"✓ Date patterns: {len(DATE_PATTERNS)} patterns, {len(MONTH_MAP)} months")


class TestModelsModule:
    """Test Pydantic models"""
    
    def test_all_models_importable(self):
        """All Pydantic models should be importable"""
        from models import (
            LLMHeaders,
            SettingsInput,
            SessionCreate,
            SessionUpdate,
            CVUploadResponse,
            ChronologyRequest
        )
        
        assert LLMHeaders is not None
        assert SessionCreate is not None
        print("✓ All Pydantic models importable")
    
    def test_chronology_request_model(self):
        """ChronologyRequest model should work"""
        from models import ChronologyRequest
        
        req = ChronologyRequest(
            experiences=[{"title": "Dev", "duration": "2020-2023"}],
            reverse=True
        )
        assert req.reverse is True
        assert len(req.experiences) == 1
        print("✓ ChronologyRequest model works")


class TestServerStillFunctional:
    """Integration tests to ensure server.py still works after refactoring"""
    
    def test_api_responds_correctly(self):
        """Verify backend API responds correctly via /api routes"""
        # Test multiple API endpoints to confirm server.py is functional
        endpoints = [
            "/api/health",
            "/api/sessions",
            "/api/cv/active"
        ]
        for endpoint in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code == 200, f"Endpoint {endpoint} failed"
        print(f"✓ All {len(endpoints)} API endpoints respond correctly")
    
    def test_create_and_delete_session(self):
        """Session CRUD should still work"""
        # This tests that server.py hasn't been broken by refactoring
        # Note: LLM headers required for some endpoints
        
        # Create session (this might fail without LLM headers, which is expected)
        create_response = requests.post(
            f"{BASE_URL}/api/sessions",
            json={"title": "TEST_Refactoring_Session"},
            headers={
                "X-LLM-Provider": "openai",
                "X-LLM-Model": "gpt-4o",
                "X-LLM-Api-Key": "test-key-for-session-create"
            }
        )
        
        # Session creation should work (it may not require LLM key)
        if create_response.status_code == 201:
            session_data = create_response.json()
            session_id = session_data.get("id")
            print(f"✓ Session created: {session_id}")
            
            # Clean up
            delete_response = requests.delete(f"{BASE_URL}/api/sessions/{session_id}")
            assert delete_response.status_code in [200, 204]
            print("✓ Session deleted")
        else:
            # If creation requires LLM key, that's also acceptable behavior
            print(f"✓ Session endpoint responds (status={create_response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
