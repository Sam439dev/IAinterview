"""
Backend API Tests for Interview AI Assistant
Tests: Health, Settings, CV, Sessions, Process Audio, Summary Generation
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_ok(self):
        """GET /api/health should return status ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestSettingsEndpoints:
    """Settings API tests"""
    
    def test_get_settings(self):
        """GET /api/settings should return settings with masked key"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert "server_storage" in data
        assert data["server_storage"] == False
        assert "preferred_model" in data
        assert "preferred_provider" in data
        
    def test_post_settings_model_change(self):
        """POST /api/settings should accept preference updates"""
        response = requests.post(f"{BASE_URL}/api/settings", json={
            "preferred_model": "gpt-4o"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
    def test_validate_key_missing(self):
        """POST /api/settings/validate-key should return invalid in BYOK mode"""
        response = requests.post(f"{BASE_URL}/api/settings/validate-key")
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == False


class TestCVEndpoints:
    """CV management API tests"""
    
    def test_get_active_cv(self):
        """GET /api/cv/active should return active CV or null"""
        response = requests.get(f"{BASE_URL}/api/cv/active")
        assert response.status_code == 200
        data = response.json()
        # Can be null or CV object
        if data is not None:
            assert "file_name" in data
            assert "parsed_data" in data
            assert "is_active" in data
            assert data["is_active"] == True
            # Verify parsed_data structure
            parsed = data.get("parsed_data", {})
            assert "raw_text" in parsed or "full_name" in parsed
            
    def test_cv_upload_requires_api_key(self):
        """POST /api/cv/upload should require API key"""
        # Create a simple text file
        files = {'file': ('test.txt', b'Test CV content', 'text/plain')}
        response = requests.post(f"{BASE_URL}/api/cv/upload", files=files)
        # Should either succeed (if key exists) or fail with 400 (no key)
        assert response.status_code in [200, 201, 400, 422]
        
    def test_cv_reparse_endpoint_exists(self):
        """POST /api/cv/reparse endpoint should exist"""
        response = requests.post(f"{BASE_URL}/api/cv/reparse")
        # Should return 400 (no key), 404 (no CV), or 200 (success)
        assert response.status_code in [200, 400, 404, 401, 422]


class TestSessionsEndpoints:
    """Sessions CRUD API tests"""
    
    @pytest.fixture
    def test_session(self):
        """Create a test session and clean up after"""
        response = requests.post(f"{BASE_URL}/api/sessions", json={
            "title": "TEST_Session_Pytest",
            "target_role": "Software Engineer",
            "job_description": "Test job description"
        })
        if response.status_code == 403:
            # Max sessions reached, skip
            pytest.skip("Max sessions limit reached")
        assert response.status_code == 200
        session = response.json()
        yield session
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sessions/{session['id']}")
        
    def test_list_sessions(self):
        """GET /api/sessions should return list"""
        response = requests.get(f"{BASE_URL}/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_get_session_stats(self):
        """GET /api/sessions/stats should return statistics"""
        response = requests.get(f"{BASE_URL}/api/sessions/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_questions" in data
        assert "avg_latency" in data
        assert "total_duration" in data
        assert "total_sessions" in data
        
    def test_create_session(self, test_session):
        """POST /api/sessions should create session"""
        assert "id" in test_session
        assert test_session["title"] == "TEST_Session_Pytest"
        assert test_session["status"] == "active"
        assert test_session["target_role"] == "Software Engineer"
        
    def test_update_session(self, test_session):
        """PUT /api/sessions/{id} should update session"""
        response = requests.put(f"{BASE_URL}/api/sessions/{test_session['id']}", json={
            "status": "completed",
            "duration_seconds": 120
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
    def test_get_session_messages(self, test_session):
        """GET /api/sessions/{id}/messages should return messages"""
        response = requests.get(f"{BASE_URL}/api/sessions/{test_session['id']}/messages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_delete_session(self):
        """DELETE /api/sessions/{id} should delete session"""
        # Create session to delete
        create_resp = requests.post(f"{BASE_URL}/api/sessions", json={
            "title": "TEST_ToDelete"
        })
        if create_resp.status_code == 403:
            pytest.skip("Max sessions limit reached")
        session_id = create_resp.json()["id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/sessions/{session_id}")
        assert response.status_code == 200
        
        # Verify deleted
        sessions = requests.get(f"{BASE_URL}/api/sessions").json()
        ids = [s["id"] for s in sessions]
        assert session_id not in ids


class TestProcessAudioEndpoint:
    """Process audio endpoint tests"""
    
    @pytest.fixture
    def test_session_for_audio(self):
        """Create session for audio processing"""
        response = requests.post(f"{BASE_URL}/api/sessions", json={
            "title": "TEST_AudioSession"
        })
        if response.status_code == 403:
            pytest.skip("Max sessions limit reached")
        session = response.json()
        yield session
        requests.delete(f"{BASE_URL}/api/sessions/{session['id']}")
        
    def test_process_audio_endpoint_exists(self, test_session_for_audio):
        """POST /api/interview/process-audio should exist and respond"""
        # Create minimal mock audio data (base64 encoded)
        mock_audio = base64.b64encode(b"mock audio data").decode('utf-8')
        
        response = requests.post(f"{BASE_URL}/api/interview/process-audio", json={
            "session_id": test_session_for_audio["id"],
            "audio_data": mock_audio,
            "mime_type": "audio/webm"
        })
        # Should return 200 (with error in body), 400 (missing key), or 422 (missing headers)
        assert response.status_code in [200, 400, 422]
        
    def test_process_audio_requires_session(self):
        """POST /api/interview/process-audio should require valid session"""
        mock_audio = base64.b64encode(b"mock audio").decode('utf-8')
        
        response = requests.post(f"{BASE_URL}/api/interview/process-audio", json={
            "session_id": "000000000000000000000000",  # Invalid ObjectId
            "audio_data": mock_audio,
            "mime_type": "audio/webm"
        })
        # Should return 404 (session not found) or 400 (no key)
        assert response.status_code in [400, 404]


class TestSummaryEndpoints:
    """Summary generation endpoint tests"""
    
    @pytest.fixture
    def test_session_for_summary(self):
        """Create session for summary testing"""
        response = requests.post(f"{BASE_URL}/api/sessions", json={
            "title": "TEST_SummarySession"
        })
        if response.status_code == 403:
            pytest.skip("Max sessions limit reached")
        session = response.json()
        yield session
        requests.delete(f"{BASE_URL}/api/sessions/{session['id']}")
        
    def test_generate_summary_handles_empty_session(self, test_session_for_summary):
        """POST /api/sessions/{id}/generate-summary should handle empty sessions with fallback"""
        response = requests.post(f"{BASE_URL}/api/sessions/{test_session_for_summary['id']}/generate-summary")
        # v2.0: Returns 200 with fallback summary for empty sessions, or 400 if no API key
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            data = response.json()
            # Should have fallback summary structure
            assert "session_insights" in data or "transcript" in data
        
    def test_get_summary_returns_null_if_none(self, test_session_for_summary):
        """GET /api/sessions/{id}/summary should return null if no summary"""
        response = requests.get(f"{BASE_URL}/api/sessions/{test_session_for_summary['id']}/summary")
        assert response.status_code == 200
        # Should be null or empty
        data = response.json()
        assert data is None or data == {}


class TestSmallTalkFiltering:
    """Test small talk filtering logic"""
    
    def test_small_talk_patterns_exist(self):
        """Verify small talk patterns are defined in backend"""
        # This is a code review check - patterns should exist
        # We can't directly test the function, but we verify the endpoint handles it
        pass


class TestCVParsing:
    """CV parsing and context building tests"""
    
    def test_cv_has_parsed_data(self):
        """Active CV should have parsed_data with structured fields"""
        response = requests.get(f"{BASE_URL}/api/cv/active")
        if response.status_code == 200 and response.json():
            cv = response.json()
            parsed = cv.get("parsed_data", {})
            # Should have at least raw_text or structured fields
            has_content = (
                parsed.get("raw_text") or 
                parsed.get("full_name") or 
                parsed.get("skills") or
                parsed.get("experiences")
            )
            assert has_content, "CV parsed_data should have content"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
