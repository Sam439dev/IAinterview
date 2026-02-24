import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/auth/ProtectedRoute';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Interview from './pages/Interview';
import Settings from './pages/Settings';
import Sessions from './pages/Sessions';
import SessionSummary from './pages/SessionSummary';
import Analysis from './pages/Analysis';
import Login from './pages/Login';
import Register from './pages/Register';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-void noise">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            
            {/* Auth routes (redirect to dashboard if already logged in) */}
            <Route path="/login" element={
              <PublicRoute><Login /></PublicRoute>
            } />
            <Route path="/register" element={
              <PublicRoute><Register /></PublicRoute>
            } />
            
            {/* Protected routes (require authentication) */}
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/interview" element={
              <ProtectedRoute><Interview /></ProtectedRoute>
            } />
            <Route path="/interview/:sessionId" element={
              <ProtectedRoute><Interview /></ProtectedRoute>
            } />
            <Route path="/session/:sessionId/summary" element={
              <ProtectedRoute><SessionSummary /></ProtectedRoute>
            } />
            <Route path="/analysis/:sessionId" element={
              <ProtectedRoute><Analysis /></ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute><Settings /></ProtectedRoute>
            } />
            <Route path="/sessions" element={
              <ProtectedRoute><Sessions /></ProtectedRoute>
            } />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

