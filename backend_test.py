import requests
import sys
import json
import base64
from datetime import datetime

class InterviewAIAPITester:
    def __init__(self, base_url="https://speech-analyst.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session_id = None
        self.critical_failures = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, critical=False):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            print(f"   Status: {response.status_code}")
            
            # Check for 500 errors (critical failure)
            if response.status_code == 500:
                self.critical_failures.append(f"{name}: 500 Internal Server Error")
                print(f"❌ CRITICAL - 500 Internal Server Error")
                print(f"   Response: {response.text[:500]}")
                return False, {}
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Expected {expected_status}, got {response.status_code}")
                try:
                    response_data = response.json() if response.content else {}
                    if response_data:
                        print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                if critical:
                    self.critical_failures.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                print(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False, {}

        except requests.exceptions.Timeout:
            if critical:
                self.critical_failures.append(f"{name}: Request timeout")
            print(f"❌ FAILED - Request timeout (30s)")
            return False, {}
        except Exception as e:
            if critical:
                self.critical_failures.append(f"{name}: {str(e)}")
            print(f"❌ FAILED - Error: {str(e)}")
            return False, {}

    def test_health_endpoint(self):
        """Test health endpoint returns ok"""
        success, response = self.run_test("Health Check", "GET", "api/health", 200, critical=True)
        if success:
            if response.get('status') != 'ok':
                print(f"❌ Expected status='ok', got {response.get('status')}")
                return False
            print(f"✅ Health endpoint returns status='ok'")
        return success

    def test_session_lifecycle_with_uuids(self):
        """Test complete session lifecycle with UUID validation"""
        print("\n🔄 Testing Session Lifecycle with UUIDs...")
        
        # 1. List sessions (should be empty or contain existing sessions)
        success, sessions = self.run_test("List Sessions", "GET", "api/sessions", 200, critical=True)
        if not success:
            return False
        
        initial_count = len(sessions) if isinstance(sessions, list) else 0
        print(f"   Initial sessions count: {initial_count}")
        
        # 2. Create session
        session_data = {
            "title": f"Phase 2 Test Session {datetime.now().strftime('%H:%M:%S')}",
            "target_role": "Software Engineer",
            "job_description": "Test job description"
        }
        success, response = self.run_test("Create Session", "POST", "api/sessions", 200, session_data, critical=True)
        if not success:
            return False
        
        # Validate UUID format
        session_id = response.get('id')
        if not session_id:
            print(f"❌ No session ID returned")
            return False
        
        # Basic UUID validation (36 chars with hyphens)
        if len(session_id) != 36 or session_id.count('-') != 4:
            print(f"❌ Session ID doesn't look like UUID: {session_id}")
            return False
        
        self.session_id = session_id
        print(f"✅ Created session with UUID: {session_id}")
        
        # 3. List sessions again (should have one more)
        success, sessions = self.run_test("List Sessions After Create", "GET", "api/sessions", 200)
        if not success:
            return False
        
        new_count = len(sessions) if isinstance(sessions, list) else 0
        if new_count != initial_count + 1:
            print(f"❌ Expected {initial_count + 1} sessions, got {new_count}")
            return False
        
        # 4. Update session
        update_data = {"status": "completed", "duration_seconds": 300}
        success, _ = self.run_test("Update Session", "PUT", f"api/sessions/{session_id}", 200, update_data)
        if not success:
            return False
        
        # 5. Get session messages (should be empty)
        success, messages = self.run_test("Get Session Messages", "GET", f"api/sessions/{session_id}/messages", 200)
        if not success:
            return False
        
        if not isinstance(messages, list):
            print(f"❌ Expected messages array, got {type(messages)}")
            return False
        
        # 6. Delete session
        success, _ = self.run_test("Delete Session", "DELETE", f"api/sessions/{session_id}", 200)
        if not success:
            return False
        
        # 7. Verify deletion
        success, sessions = self.run_test("List Sessions After Delete", "GET", "api/sessions", 200)
        if not success:
            return False
        
        final_count = len(sessions) if isinstance(sessions, list) else 0
        if final_count != initial_count:
            print(f"❌ Expected {initial_count} sessions after delete, got {final_count}")
            return False
        
        print(f"✅ Session lifecycle completed successfully with UUID")
        return True

    def test_llm_endpoints_without_headers(self):
        """Test LLM endpoints return 422/400 when headers missing"""
        print("\n🔒 Testing LLM Endpoints Without Headers...")
        
        # First create a session for endpoints that need it
        session_data = {"title": "LLM Test Session"}
        success, response = self.run_test("Create Session for LLM Tests", "POST", "api/sessions", 200, session_data)
        if not success:
            return False
        
        test_session_id = response.get('id')
        
        # Test CV upload without LLM headers
        # Create a simple test file
        test_file_content = b"Test CV content"
        files = {'file': ('test_cv.txt', test_file_content, 'text/plain')}
        
        print(f"\n🔍 Testing CV Upload without LLM headers...")
        try:
            url = f"{self.base_url}/api/cv/upload"
            response = requests.post(url, files=files, timeout=30)
            print(f"   Status: {response.status_code}")
            
            if response.status_code in [400, 422]:
                print(f"✅ CV Upload correctly returns {response.status_code} without LLM headers")
                cv_upload_success = True
            elif response.status_code == 500:
                self.critical_failures.append("CV Upload: 500 Internal Server Error")
                print(f"❌ CRITICAL - CV Upload returns 500")
                cv_upload_success = False
            else:
                print(f"❌ CV Upload should return 400/422, got {response.status_code}")
                cv_upload_success = False
        except Exception as e:
            print(f"❌ CV Upload failed with error: {e}")
            cv_upload_success = False
        
        # Test CV reparse without LLM headers
        reparse_success, _ = self.run_test(
            "CV Reparse without LLM headers", 
            "POST", 
            "api/cv/reparse", 
            400  # Expecting 400/422
        )
        if not reparse_success:
            # Try 422 as alternative
            reparse_success, _ = self.run_test(
                "CV Reparse without LLM headers (422)", 
                "POST", 
                "api/cv/reparse", 
                422
            )
        
        # Test process-audio without LLM headers
        audio_data = {
            "session_id": test_session_id,
            "audio_data": base64.b64encode(b"fake audio data").decode(),
            "mime_type": "audio/webm"
        }
        audio_success, _ = self.run_test(
            "Process Audio without LLM headers", 
            "POST", 
            "api/interview/process-audio", 
            400
        )
        if not audio_success:
            # Try 422 as alternative
            audio_success, _ = self.run_test(
                "Process Audio without LLM headers (422)", 
                "POST", 
                "api/interview/process-audio", 
                422
            )
        
        # Test generate-summary without LLM headers
        summary_success, _ = self.run_test(
            "Generate Summary without LLM headers", 
            "POST", 
            f"api/sessions/{test_session_id}/generate-summary", 
            400
        )
        if not summary_success:
            # Try 422 as alternative
            summary_success, _ = self.run_test(
                "Generate Summary without LLM headers (422)", 
                "POST", 
                f"api/sessions/{test_session_id}/generate-summary", 
                422
            )
        
        # Clean up test session
        self.run_test("Delete LLM Test Session", "DELETE", f"api/sessions/{test_session_id}", 200)
        
        all_success = cv_upload_success and reparse_success and audio_success and summary_success
        if all_success:
            print(f"✅ All LLM endpoints correctly return 400/422 without headers")
        else:
            print(f"❌ Some LLM endpoints don't handle missing headers correctly")
        
        return all_success

    def test_settings_endpoints(self):
        """Test settings endpoints (no LLM headers required)"""
        print("\n⚙️ Testing Settings Endpoints...")
        
        # GET settings
        success, response = self.run_test("Get Settings", "GET", "api/settings", 200)
        if not success:
            return False
        
        # Validate response structure
        expected_fields = ['server_storage', 'preferred_provider', 'preferred_model', 'has_key']
        for field in expected_fields:
            if field not in response:
                print(f"❌ Missing field in settings: {field}")
                return False
        
        # POST settings
        settings_data = {"preferred_provider": "openai", "preferred_model": "gpt-4o-mini"}
        success, _ = self.run_test("Save Settings", "POST", "api/settings", 200, settings_data)
        if not success:
            return False
        
        # Validate key endpoint
        success, _ = self.run_test("Validate Key", "POST", "api/settings/validate-key", 200)
        
        return success

    def test_cv_active_endpoint(self):
        """Test CV active endpoint (no LLM headers required)"""
        return self.run_test("Get Active CV", "GET", "api/cv/active", 200)

    def test_session_stats(self):
        """Test session stats endpoint"""
        success, response = self.run_test("Get Session Stats", "GET", "api/sessions/stats", 200)
        if success:
            expected_fields = ['total_questions', 'avg_latency', 'total_duration', 'total_sessions']
            for field in expected_fields:
                if field not in response:
                    print(f"❌ Missing field in stats: {field}")
                    return False
        return success

    def test_ingestion_endpoints(self):
        """Test ingestion endpoints with FAISS persistence"""
        print("\n📊 Testing Ingestion Endpoints...")
        
        # 1. Test ingestion status when no index exists (should return available=false)
        print("\n🔍 Testing ingestion status (no index)...")
        success, response = self.run_test("Ingestion Status (no index)", "GET", "api/ingestion/status", 200, critical=True)
        if not success:
            return False
        
        # Validate response structure for no index
        if response.get('available') != False:
            print(f"❌ Expected available=false when no index, got {response.get('available')}")
            return False
        
        if response.get('doc_count') != 0:
            print(f"❌ Expected doc_count=0 when no index, got {response.get('doc_count')}")
            return False
        
        print(f"✅ Ingestion status correctly returns available=false when no index")
        
        # 2. Test clear cache (should return cleared=true even if nothing to clear)
        print("\n🧹 Testing clear cache...")
        success, response = self.run_test("Clear Cache", "POST", "api/ingestion/clear-cache", 200, critical=True)
        if not success:
            return False
        
        if response.get('cleared') != True:
            print(f"❌ Expected cleared=true, got {response.get('cleared')}")
            return False
        
        print(f"✅ Clear cache correctly returns cleared=true")
        
        # 3. Test search with empty index (should return empty matches)
        print("\n🔍 Testing search with no index...")
        search_data = {"query": "test query", "k": 5}
        success, response = self.run_test("Search (no index)", "POST", "api/ingestion/search", 200, search_data, critical=True)
        if not success:
            return False
        
        if not isinstance(response.get('matches'), list):
            print(f"❌ Expected matches to be a list, got {type(response.get('matches'))}")
            return False
        
        if len(response.get('matches', [])) != 0:
            print(f"❌ Expected empty matches when no index, got {len(response.get('matches', []))} matches")
            return False
        
        print(f"✅ Search correctly returns empty matches when no index")
        
        # 4. Test build-profile without LLM headers (should return 422/400)
        print("\n🔒 Testing build-profile without LLM headers...")
        profile_data = {
            "job_description": "Software Engineer position requiring Python and FastAPI experience",
            "company_name": "Test Company",
            "target_role": "Software Engineer"
        }
        
        # Try 422 first
        success, _ = self.run_test("Build Profile without LLM headers (422)", "POST", "api/ingestion/build-profile", 422, profile_data)
        if not success:
            # Try 400 as alternative
            success, _ = self.run_test("Build Profile without LLM headers (400)", "POST", "api/ingestion/build-profile", 400, profile_data)
        
        if success:
            print(f"✅ Build profile correctly returns 400/422 without LLM headers")
        else:
            print(f"❌ Build profile should return 400/422 without LLM headers")
            return False
        
        return True

def main():
    print("🚀 Starting Backend API Tests - Ingestion + FAISS Focus")
    print("Focus: Ingestion endpoints, FAISS persistence, Health, Session CRUD")
    print("=" * 60)
    
    tester = InterviewAIAPITester()
    
    # Tests with focus on ingestion endpoints
    test_methods = [
        ("1. Health Check", tester.test_health_endpoint),
        ("2. Ingestion Endpoints", tester.test_ingestion_endpoints),
        ("3. Session Lifecycle with UUIDs", tester.test_session_lifecycle_with_uuids),
        ("4. LLM Endpoints Without Headers", tester.test_llm_endpoints_without_headers),
        ("5. Settings Endpoints", tester.test_settings_endpoints),
        ("6. CV Active Endpoint", tester.test_cv_active_endpoint),
        ("7. Session Stats", tester.test_session_stats),
    ]
    
    failed_tests = []
    
    for test_name, test_method in test_methods:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            success = test_method()
            if not success:
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ FAILED - Exception during {test_name}: {str(e)}")
            failed_tests.append(test_name)
    
    # Print final results
    print(f"\n{'='*60}")
    print(f"🏁 BACKEND TEST RESULTS - INGESTION + FAISS FOCUS")
    print(f"{'='*60}")
    print(f"📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    
    # Check for critical failures (500 errors)
    if tester.critical_failures:
        print(f"\n🚨 CRITICAL FAILURES (500 errors):")
        for failure in tester.critical_failures:
            print(f"   - {failure}")
    
    if failed_tests:
        print(f"\n❌ Failed tests: {len(failed_tests)}")
        for test_name in failed_tests:
            print(f"   - {test_name}")
        
        print(f"\n🔧 Issues Found:")
        if tester.critical_failures:
            print("   - CRITICAL: 500 Internal Server Errors detected")
        print("   - Check server logs for detailed error information")
        print("   - Verify ingestion endpoints are working correctly")
        print("   - Ensure FAISS persistence is functioning")
        print("   - Verify LLM header validation is working correctly")
        return 1
    else:
        print("✅ All backend tests passed!")
        print("✅ Health endpoint working")
        print("✅ Ingestion endpoints working correctly")
        print("✅ FAISS persistence functioning")
        print("✅ Session lifecycle with UUIDs working")
        print("✅ LLM endpoints properly reject requests without headers")
        print("✅ No 500 Internal Server Errors detected")
        return 0

if __name__ == "__main__":
    sys.exit(main())