import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Clock, MessageSquare, Zap, TrendingUp, Calendar, ChevronRight, Play, Trash2, Loader2, Plus } from 'lucide-react';
import { getSessions, getStats, deleteSession } from '../services/api';
import Navbar from '../components/Navbar';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total_questions: 0, avg_latency: 0, total_duration: 0, total_sessions: 0 });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    try {
      const [se, st] = await Promise.all([getSessions(), getStats()]);
      setSessions(se || []);
      setStats(st);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleDel = async (id) => {
    if (!window.confirm('Supprimer cette session ?')) return;
    setDeleting(id);
    try { await deleteSession(id); load(); } catch {} finally { setDeleting(null); }
  };

  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };

  return (
    <div className="min-h-screen bg-void">
      <Navbar title="Sessions" showBack backTo="/dashboard" />
      <main className="max-w-[1200px] mx-auto px-5 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            { icon: MessageSquare, label: 'Sessions', val: `${sessions.length}/10`, color: 'text-accent' },
            { icon: Zap, label: 'Questions', val: stats.total_questions, color: 'text-accent2' },
            { icon: Clock, label: 'Latence moy.', val: `${stats.avg_latency}ms`, color: 'text-emerald-400' },
            { icon: TrendingUp, label: 'Temps total', val: `${Math.round(stats.total_duration / 60)}min`, color: 'text-amber-400' },
          ].map((s, i) => (
            <div key={i} className="card p-4" data-testid={`session-stat-${i}`}>
              <div className="flex items-center justify-between mb-3">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-[0.65rem] text-slate-500 font-mono uppercase tracking-wider">{s.label}</span>
              </div>
              <p className={`text-xl font-display font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold text-sm" data-testid="sessions-heading">Historique</h2>
              <p className="text-xs text-slate-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
            </div>
            <Link to="/interview"><button className="btn btn-primary text-xs" data-testid="new-session-btn"><Plus className="w-3.5 h-3.5" /> Nouvelle</button></Link>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-white/[0.02] animate-pulse" />)}</div>
            ) : sessions.length > 0 ? (
              <div className="space-y-2.5">
                {sessions.map(s => (
                  <div key={s.id} className="card-inner p-4 hover:border-accent/10 transition-colors" data-testid={`session-row-${s.id}`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-sm font-medium">{s.title}</h3>
                        <span className={`chip text-[0.6rem] ${
                          s.status === 'active' ? 'chip-success' : s.status === 'paused' ? 'chip-warn' : 'chip-neutral'
                        }`}>{s.status === 'active' ? 'Actif' : s.status === 'paused' ? 'Pause' : 'Terminé'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Link to={`/interview/${s.id}`}>
                          <button className="btn btn-outline text-[0.65rem] py-1.5 px-3" data-testid={`view-${s.id}`}>
                            <Play className="w-3 h-3" /> {s.status === 'completed' ? 'Voir' : 'Reprendre'}
                          </button>
                        </Link>
                        <button className="btn btn-danger-outline text-[0.65rem] py-1.5 px-3" onClick={() => handleDel(s.id)} disabled={deleting === s.id} data-testid={`del-${s.id}`}>
                          {deleting === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[0.7rem] text-slate-500">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(s.created_at)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {s.total_questions || 0} questions</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {Math.round((s.duration_seconds || 0) / 60)} min</span>
                      <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {s.avg_latency_ms || 0}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12" data-testid="no-sessions">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-7 h-7 text-slate-700" />
                </div>
                <p className="text-sm text-slate-400 mb-1 font-medium">Aucune session</p>
                <p className="text-xs text-slate-500 mb-4">Lancez votre première session d'entraînement</p>
                <Link to="/interview"><button className="btn btn-primary text-xs">Démarrer <ChevronRight className="w-3.5 h-3.5" /></button></Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
