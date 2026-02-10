import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Interview from './pages/Interview';
import Settings from './pages/Settings';
import Sessions from './pages/Sessions';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-void cyber-grid">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/interview/:sessionId" element={<Interview />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/sessions" element={<Sessions />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
