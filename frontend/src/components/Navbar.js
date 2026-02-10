import React from 'react';
import { Link } from 'react-router-dom';
import { Brain, Mic, ChevronLeft, Settings as SettingsIcon } from 'lucide-react';

export default function Navbar({ title, showBack = false, backTo = '/dashboard' }) {
  return (
    <nav className="border-b border-slate-800/50 bg-void/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-4 lg:px-8">
        <div className="flex items-center gap-4">
          {showBack && (
            <Link to={backTo} className="btn-ghost p-2" data-testid="nav-back-btn">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
            <div className="w-8 h-8 border border-cyber-cyan/50 flex items-center justify-center glow-cyan">
              <Brain className="w-5 h-5 text-cyber-cyan" />
            </div>
            <span className="font-heading font-bold text-sm tracking-widest text-cyber-cyan text-glow-cyan hidden sm:block">
              INTERVIEW AI
            </span>
          </Link>
          {title && (
            <>
              <span className="text-slate-700">/</span>
              <span className="font-heading text-sm tracking-wider text-slate-400">{title}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link to="/settings" className="btn-ghost p-2" data-testid="nav-settings-btn">
            <SettingsIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </nav>
  );
}
