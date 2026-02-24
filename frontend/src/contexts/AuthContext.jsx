import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.REACT_APP_BACKEND_URL || '';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load auth state from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
    setLoading(false);
  }, []);

  // Save to localStorage when token/user changes
  useEffect(() => {
    if (token && user) {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    }
  }, [token, user]);

  const register = useCallback(async (email, password, fullName) => {
    setError(null);
    setLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }
      
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    setLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }
      
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.warn('Logout API call failed:', e);
    }
    
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('refresh_token');
  }, [token]);

  const refreshToken = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem('refresh_token');
    if (!storedRefreshToken) return false;
    
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh?refresh_token=${encodeURIComponent(storedRefreshToken)}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Token refresh failed');
      }
      
      const data = await response.json();
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      return true;
    } catch (e) {
      console.error('Token refresh failed:', e);
      logout();
      return false;
    }
  }, [logout]);

  const requestPasswordReset = useCallback(async (email) => {
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/password-reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Password reset request failed');
      }
      
      return { success: true, message: data.message };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const resetPassword = useCallback(async (token, newPassword) => {
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Password reset failed');
      }
      
      return { success: true, message: data.message };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // Auto-refresh token before expiration
  useEffect(() => {
    if (!token) return;
    
    // Refresh token every 23 hours (token expires in 24h)
    const interval = setInterval(() => {
      refreshToken();
    }, 23 * 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [token, refreshToken]);

  const value = {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!token && !!user,
    register,
    login,
    logout,
    refreshToken,
    requestPasswordReset,
    resetPassword,
    clearError: () => setError(null)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
