import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';

export default function Navbar({ title, showBack, backTo = '/dashboard' }) {
  return (
    <header className="sticky top-0 z-50 h-14 border-b border-white/[0.04] bg-void/80 backdrop-blur-xl" data-testid="navbar">
      <div className="max-w-[1440px] mx-auto h-full flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          {showBack && (
            <Link to={backTo} className="btn-ghost" data-testid="nav-back">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <Link to="/" className="flex items-center gap-2.5" data-testid="nav-logo">
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Z"/><path d="M16 10v1a4 4 0 0 1-8 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
            <span className="font-display font-semibold text-sm tracking-wide text-accent hidden sm:block">InterviewAI</span>
          </Link>
          {title && (
            <>
              <span className="text-white/10">/</span>
              <span className="font-display text-xs tracking-wider text-slate-500 uppercase">{title}</span>
            </>
          )}
        </div>
        <Link to="/settings" className="btn-ghost" data-testid="nav-settings">
          <Settings className="w-4 h-4" />
        </Link>
      </div>
    </header>
  );
}
