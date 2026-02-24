"""
Auth JWT API Tests - Interview Copilot
Tests for user registration, login, token refresh, and protected routes
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://jwt-interview.preview.emergentagent.com').rstrip('/')


class TestAuthRegister:
    """User registration endpoint tests"""
    
    def test_register_success(self):
        """Test successful user registration"""
        import time
        unique_email = f"test_register_{int(time.time())}@example.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "full_name": "Test Register User"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert "user" in data
        assert data["user"]["email"] == unique_email
        assert data["user"]["full_name"] == "Test Register User"
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0
    
    def test_register_duplicate_email(self):
        """Test registration with existing email fails"""
        # First register a user
        import time
        unique_email = f"test_dup_{int(time.time())}@example.com"
        
        response1 = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "full_name": "First User"
        })
        assert response1.status_code == 200
        
        # Try to register with same email
        response2 = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "full_name": "Second User"
        })
        assert response2.status_code == 400, f"Expected 400, got {response2.status_code}"
    
    def test_register_invalid_email(self):
        """Test registration with invalid email format"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": "invalid-email",
            "password": "TestPass123",
            "full_name": "Test User"
        })
        assert response.status_code == 422  # Validation error
    
    def test_register_short_password(self):
        """Test registration with password < 8 chars fails"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": "shortpass@example.com",
            "password": "123",
            "full_name": "Test User"
        })
        assert response.status_code == 422  # Validation error


class TestAuthLogin:
    """User login endpoint tests"""
    
    def test_login_success(self):
        """Test login with existing user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "TestPass123"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"
        assert data["token_type"] == "bearer"
    
    def test_login_invalid_password(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "WrongPassword123"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_login_nonexistent_user(self):
        """Test login with non-existent email"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "TestPass123"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


class TestProtectedRoutes:
    """Protected route (token validation) tests"""
    
    def test_get_me_with_valid_token(self):
        """Test /api/auth/me with valid token"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "TestPass123"
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Access protected route
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        
        assert me_response.status_code == 200
        data = me_response.json()
        assert data["email"] == "test@example.com"
    
    def test_get_me_without_token(self):
        """Test /api/auth/me without authorization header"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
    
    def test_get_me_with_invalid_token(self):
        """Test /api/auth/me with invalid token"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": "Bearer invalid_token_here"
        })
        assert response.status_code == 401


class TestTokenRefresh:
    """Token refresh endpoint tests"""
    
    def test_refresh_token_success(self):
        """Test refreshing access token"""
        # Login to get tokens
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "TestPass123"
        })
        assert login_response.status_code == 200
        refresh_token = login_response.json()["refresh_token"]
        
        # Refresh token
        refresh_response = requests.post(
            f"{BASE_URL}/api/auth/refresh?refresh_token={refresh_token}"
        )
        
        assert refresh_response.status_code == 200
        data = refresh_response.json()
        assert "access_token" in data
        assert "refresh_token" in data
    
    def test_refresh_with_invalid_token(self):
        """Test refresh with invalid refresh token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/refresh?refresh_token=invalid_token"
        )
        assert response.status_code == 401


class TestLogout:
    """Logout endpoint tests"""
    
    def test_logout_success(self):
        """Test logout with valid token"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "TestPass123"
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Logout
        logout_response = requests.post(f"{BASE_URL}/api/auth/logout", headers={
            "Authorization": f"Bearer {token}"
        })
        
        assert logout_response.status_code == 200
        assert "message" in logout_response.json()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
