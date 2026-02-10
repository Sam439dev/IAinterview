import requests
import sys
import json
from datetime import datetime

class InterviewAIAPITester:
    def __init__(self, base_url="https://ai-assistant-fix-4.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
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
                print(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ FAILED - Request timeout (30s)")
            return False, {}
        except Exception as e:
            print(f"❌ FAILED - Error: {str(e)}")
            return False, {}

    def test_health_endpoint(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "api/health", 200)

    def test_settings_get_initial(self):
        """Test initial settings GET - Account for existing key"""
        success, response = self.run_test("Get Settings", "GET", "api/settings", 200)
        if success:
            expected_fields = ['openai_api_key', 'preferred_model', 'has_key']
            for field in expected_fields:
                if field not in response:
                    print(f"❌ Missing field in response: {field}")
                    return False
            # Note: Previous session may have saved a key already
            has_key = response.get('has_key')
            if has_key:
                print(f"✅ API key already configured from previous session")
            else:
                print(f"✅ No API key configured initially")
        return success

    def test_settings_save_api_key(self):
        """Test saving API key"""
        test_key = "sk-test-1234567890abcdef"
        return self.run_test(
            "Save API Key Settings", 
            "POST", 
            "api/settings", 
            200, 
            {"openai_api_key": test_key, "preferred_model": "gpt-4o-mini"}
        )

    def test_settings_get_with_key(self):
        """Test settings GET after saving key"""
        success, response = self.run_test("Get Settings After Save", "GET", "api/settings", 200)
        if success:
            if response.get('has_key') != True:
                print(f"❌ Expected has_key=true after saving, got {response.get('has_key')}")
                return False
            # API key should be masked (can be different formats)
            api_key = response.get('openai_api_key', '')
            if not api_key or len(api_key) < 4:
                print(f"❌ API key should be present and masked, got: {api_key}")
                return False
            print(f"✅ API key properly masked: {api_key}")
        return success

    def test_sessions_get_empty(self):
        """Test initial empty sessions list"""
        success, response = self.run_test("Get Empty Sessions", "GET", "api/sessions", 200)
        if success and not isinstance(response, list):
            print(f"❌ Expected array response, got {type(response)}")
            return False
        if success and len(response) > 0:
            print(f"❌ Expected empty sessions initially, got {len(response)} sessions")
            return False
        return success

    def test_sessions_stats_empty(self):
        """Test session stats when empty"""
        success, response = self.run_test("Get Session Stats (Empty)", "GET", "api/sessions/stats", 200)
        if success:
            expected_fields = ['total_questions', 'avg_latency', 'total_duration', 'total_sessions']
            for field in expected_fields:
                if field not in response:
                    print(f"❌ Missing field in stats: {field}")
                    return False
            if response.get('total_sessions') != 0:
                print(f"❌ Expected 0 sessions in stats, got {response.get('total_sessions')}")
                return False
        return success

    def test_create_session(self):
        """Test creating a new session"""
        success, response = self.run_test(
            "Create New Session",
            "POST", 
            "api/sessions", 
            200,
            {"title": f"Test Session {datetime.now().strftime('%H:%M:%S')}"}
        )
        if success and 'id' in response:
            self.session_id = response['id']
            print(f"   Created session with ID: {self.session_id}")
            # Verify required fields
            required_fields = ['id', 'title', 'status', 'total_questions', 'created_at']
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing required field in created session: {field}")
                    return False
        return success

    def test_sessions_get_with_data(self):
        """Test getting sessions after creating one"""
        success, response = self.run_test("Get Sessions After Create", "GET", "api/sessions", 200)
        if success:
            if not isinstance(response, list) or len(response) != 1:
                print(f"❌ Expected 1 session in list, got {len(response) if isinstance(response, list) else 'not a list'}")
                return False
            session = response[0]
            if session.get('id') != self.session_id:
                print(f"❌ Session ID mismatch. Expected {self.session_id}, got {session.get('id')}")
                return False
        return success

    def test_delete_session(self):
        """Test deleting a session"""
        if not self.session_id:
            print("❌ No session ID available for deletion test")
            return False
        
        return self.run_test(
            "Delete Session",
            "DELETE",
            f"api/sessions/{self.session_id}",
            200
        )

    def test_cv_active(self):
        """Test getting active CV"""
        success, response = self.run_test("Get Active CV", "GET", "api/cv/active", 200)
        # CV may or may not exist based on previous sessions
        if success:
            if response is not None:
                print(f"✅ Active CV found: {response.get('file_name', 'Unknown')}")
            else:
                print(f"✅ No active CV found (null response)")
        return success

    def test_validate_key_endpoint(self):
        """Test API key validation endpoint"""
        test_key = "sk-test-invalid-key"
        success, response = self.run_test(
            "Validate API Key (Invalid)", 
            "POST", 
            "api/settings/validate-key", 
            200,
            {"openai_api_key": test_key}
        )
        if success:
            if 'valid' not in response:
                print(f"❌ Missing 'valid' field in validation response")
                return False
            # For invalid key, should return valid=false
            if response.get('valid') != False:
                print(f"❌ Expected valid=false for invalid key, got {response.get('valid')}")
                return False
        return success

    def test_get_session_messages(self):
        """Test getting messages for a session"""
        # First create a session to get messages for
        success, response = self.run_test(
            "Create Session for Messages Test",
            "POST", 
            "api/sessions", 
            200,
            {"title": f"Messages Test Session {datetime.now().strftime('%H:%M:%S')}"}
        )
        if not success or 'id' not in response:
            print("❌ Failed to create session for messages test")
            return False
        
        session_id = response['id']
        success, messages_response = self.run_test(
            "Get Session Messages", 
            "GET", 
            f"api/sessions/{session_id}/messages", 
            200
        )
        if success:
            if not isinstance(messages_response, list):
                print(f"❌ Expected array response for messages, got {type(messages_response)}")
                return False
            # New session should have empty messages
            if len(messages_response) > 0:
                print(f"❌ Expected empty messages for new session, got {len(messages_response)} messages")
                return False
        
        # Clean up the test session
        self.run_test("Delete Messages Test Session", "DELETE", f"api/sessions/{session_id}", 200)
        return success

def main():
    print("🚀 Starting Interview AI Assistant Backend API Tests")
    print("=" * 60)
    
    tester = InterviewAIAPITester()
    
    # Run all tests in sequence
    test_methods = [
        ("Health Check", tester.test_health_endpoint),
        ("Settings - Initial GET", tester.test_settings_get_initial),
        ("Settings - Save API Key", tester.test_settings_save_api_key),
        ("Settings - GET with Key", tester.test_settings_get_with_key),
        ("Sessions - Empty List", tester.test_sessions_get_empty),
        ("Sessions - Empty Stats", tester.test_sessions_stats_empty),
        ("Sessions - Create New", tester.test_create_session),
        ("Sessions - GET with Data", tester.test_sessions_get_with_data),
        ("Sessions - Delete", tester.test_delete_session),
        ("CV - Get Active (null)", tester.test_cv_active_null),
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
    print(f"🏁 TEST RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    
    if failed_tests:
        print(f"❌ Failed tests: {len(failed_tests)}")
        for test_name in failed_tests:
            print(f"   - {test_name}")
        print(f"\n🔧 Backend Issues Found:")
        print("   - Check server logs for detailed error information")
        print("   - Verify MongoDB connection is working")
        print("   - Ensure all API endpoints are properly implemented")
        return 1
    else:
        print("✅ All backend tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())