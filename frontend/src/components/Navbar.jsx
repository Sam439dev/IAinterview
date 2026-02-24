import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar({ title, showBack, backTo = '/dashboard' }) {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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
        
        <div className="flex items-center gap-2">
          <Link to="/settings" className="btn-ghost" data-testid="nav-settings">
            <Settings className="w-4 h-4" />
          </Link>
          
          {isAuthenticated && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="btn-ghost flex items-center gap-2 text-sm"
                data-testid="user-menu-button"
              >
                <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-accent" />
                </div>
                <span className="hidden sm:block text-slate-300 max-w-[120px] truncate">
                  {user?.full_name || user?.email}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 py-1 bg-slate-900 border border-white/10 rounded-lg shadow-xl" data-testid="user-menu-dropdown">
                  <div className="px-3 py-2 border-b border-white/5">
                    <p className="text-xs text-slate-500">Connecté en tant que</p>
                    <p className="text-sm text-slate-200 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors"
                    data-testid="logout-button"
                  >
                    <LogOut className="w-4 h-4" />
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
