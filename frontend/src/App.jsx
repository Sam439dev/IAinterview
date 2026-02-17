import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Interview from './pages/Interview';
import Settings from './pages/Settings';
import Sessions from './pages/Sessions';
import SessionSummary from './pages/SessionSummary';
import Analysis from './pages/Analysis';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-void noise">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/interview/:sessionId" element={<Interview />} />
          <Route path="/session/:sessionId/summary" element={<SessionSummary />} />
          <Route path="/analysis/:sessionId" element={<Analysis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/sessions" element={<Sessions />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
