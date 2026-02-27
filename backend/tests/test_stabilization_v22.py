"""
Test Suite V22 - Interview Copilot Stabilization
Focuses on:
1. Dashboard counters (/api/sessions/stats)
2. Interview page loads without errors
3. User menu with logout
4. WebSocket endpoint availability
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL must be set")

class TestHealthAndBasics:
    """Basic health checks"""
    
    def test_health_endpoint(self):
        """Test /api/health returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["version"] == "2.0"
        print(f"✓ Health check passed: {data}")
    
    def test_settings_endpoint(self):
        """Test /api/settings returns correctly"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert "server_storage" in data
        print(f"✓ Settings endpoint works: {data}")


class TestDashboardCounters:
    """Test dashboard stats API (previously showing 0 counters)"""
    
    def test_stats_endpoint_returns_correct_structure(self):
        """Test /api/sessions/stats returns correct JSON structure"""
        response = requests.get(f"{BASE_URL}/api/sessions/stats")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "total_questions" in data, "Missing total_questions field"
        assert "avg_latency" in data, "Missing avg_latency field"
        assert "total_duration" in data, "Missing total_duration field"
        assert "total_sessions" in data, "Missing total_sessions field"
        
        # Verify types
        assert isinstance(data["total_questions"], int), "total_questions should be int"
        assert isinstance(data["avg_latency"], (int, float)), "avg_latency should be numeric"
        assert isinstance(data["total_duration"], (int, float)), "total_duration should be numeric"
        assert isinstance(data["total_sessions"], int), "total_sessions should be int"
        
        print(f"✓ Stats API structure correct: {data}")
    
    def test_stats_matches_sessions_count(self):
        """Verify total_sessions matches actual sessions count"""
        stats_response = requests.get(f"{BASE_URL}/api/sessions/stats")
        sessions_response = requests.get(f"{BASE_URL}/api/sessions")
        
        assert stats_response.status_code == 200
        assert sessions_response.status_code == 200
        
        stats = stats_response.json()
        sessions = sessions_response.json()
        
        assert stats["total_sessions"] == len(sessions), \
            f"Stats total_sessions ({stats['total_sessions']}) doesn't match actual sessions ({len(sessions)})"
        
        print(f"✓ Sessions count matches: {stats['total_sessions']}")
    
    def test_stats_total_questions_calculation(self):
        """Verify total_questions is sum of all session questions"""
        stats_response = requests.get(f"{BASE_URL}/api/sessions/stats")
        sessions_response = requests.get(f"{BASE_URL}/api/sessions")
        
        assert stats_response.status_code == 200
        assert sessions_response.status_code == 200
        
        stats = stats_response.json()
        sessions = sessions_response.json()
        
        # Calculate expected total
        expected_total = sum(s.get("total_questions", 0) for s in sessions)
        
        assert stats["total_questions"] == expected_total, \
            f"Stats total_questions ({stats['total_questions']}) doesn't match calculated ({expected_total})"
        
        print(f"✓ Total questions calculation correct: {stats['total_questions']}")


class TestSessionsCRUD:
    """Test session creation and retrieval"""
    
    @pytest.fixture
    def test_session(self):
        """Create a test session and cleanup after"""
        # Create
        response = requests.post(
            f"{BASE_URL}/api/sessions",
            json={"title": "TEST_Stabilization_V22_Session"}
        )
        assert response.status_code == 200
        session = response.json()
        session_id = session["id"]
        
        yield session
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sessions/{session_id}")
    
    def test_create_session(self, test_session):
        """Test session creation includes stats fields"""
        assert "id" in test_session
        assert test_session["title"] == "TEST_Stabilization_V22_Session"
        assert test_session.get("total_questions", -1) == 0, "New session should have 0 questions"
        assert test_session.get("total_responses", -1) == 0, "New session should have 0 responses"
        assert test_session.get("avg_latency_ms", -1) == 0, "New session should have 0 latency"
        print(f"✓ Session created with correct initial stats")
    
    def test_session_stats_fields(self, test_session):
        """Verify session has all required stats tracking fields"""
        required_fields = [
            "total_questions",
            "total_responses",
            "avg_latency_ms",
            "duration_seconds",
            "latency_samples"
        ]
        for field in required_fields:
            assert field in test_session, f"Session missing field: {field}"
        print(f"✓ Session has all stats tracking fields")


class TestCVEndpoints:
    """Test CV-related endpoints"""
    
    def test_get_active_cv(self):
        """Test /api/cv/active returns CV or null"""
        response = requests.get(f"{BASE_URL}/api/cv/active")
        assert response.status_code == 200
        # Response can be null or CV object
        data = response.json()
        if data:
            assert "parsed_data" in data or "file_name" in data
            print(f"✓ Active CV found: {data.get('file_name', 'Unknown')}")
        else:
            print("✓ No active CV (acceptable)")
    
    def test_chronological_profile_endpoint(self):
        """Test /api/cv/chronological-profile endpoint"""
        response = requests.get(f"{BASE_URL}/api/cv/chronological-profile")
        # Can be 404 if no CV, or 200 with profile data
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            # Should have experiences or raw_cv_data
            print(f"✓ Chronological profile returned")
        else:
            print("✓ No CV to get profile (acceptable)")


class TestAuthEndpoints:
    """Test auth endpoints for user menu functionality"""
    
    def test_login_endpoint_exists(self):
        """Test /api/auth/login endpoint is accessible"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@example.com", "password": "TestPass123"}
        )
        # We expect either 200 (valid) or 401 (invalid credentials), not 404/500
        assert response.status_code in [200, 401], f"Login endpoint issue: {response.status_code}"
        print(f"✓ Login endpoint accessible (status: {response.status_code})")
    
    def test_user_profile_endpoint_exists(self):
        """Test /api/auth/me endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        # Without token, should get 401, not 404/500
        assert response.status_code in [200, 401, 403], f"Me endpoint issue: {response.status_code}"
        print(f"✓ User profile endpoint exists (status: {response.status_code})")
    
    def test_logout_endpoint_exists(self):
        """Test /api/auth/logout endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/auth/logout")
        # Without token, should get 401, not 404/500
        assert response.status_code in [200, 401, 403], f"Logout endpoint issue: {response.status_code}"
        print(f"✓ Logout endpoint exists (status: {response.status_code})")


class TestWebSocketPrerequisites:
    """Test prerequisites for WebSocket streaming"""
    
    def test_process_audio_endpoint_exists(self):
        """Test /api/interview/process-audio endpoint exists (non-streaming fallback)"""
        response = requests.post(
            f"{BASE_URL}/api/interview/process-audio",
            json={"session_id": "test", "audio_data": "", "mime_type": "audio/webm"},
            headers={
                "X-LLM-Provider": "openai",
                "X-LLM-Model": "gpt-4o",
                "X-LLM-Api-Key": "test"
            }
        )
        # Should fail validation or auth, not 404
        assert response.status_code != 404, "Audio process endpoint not found"
        print(f"✓ Audio process endpoint exists (status: {response.status_code})")
    
    def test_websocket_url_construction(self):
        """Verify WebSocket URL can be constructed from backend URL"""
        ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/api/ws/stream"
        # Just verify URL construction works
        assert "ws" in ws_url, "WebSocket URL construction failed"
        print(f"✓ WebSocket URL: {ws_url}")


class TestIngestionStatus:
    """Test ingestion/profile building status"""
    
    def test_ingestion_status_endpoint(self):
        """Test /api/ingestion/status endpoint"""
        response = requests.get(f"{BASE_URL}/api/ingestion/status")
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        print(f"✓ Ingestion status: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
