import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Clock, MessageSquare, Zap, TrendingUp, Calendar, ChevronRight, Play, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { getSessions, getSessionStats, deleteSession as apiDeleteSession } from '../services/api';
import Navbar from '../components/Navbar';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total_questions: 0, avg_latency: 0, total_duration: 0 });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchData = async () => {
    try {
      const [sess, st] = await Promise.all([getSessions(), getSessionStats()]);
      setSessions(sess || []);
      setStats(st);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette session ?')) return;
    setDeleting(id);
    try {
      await apiDeleteSession(id);
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (d) => {
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return ''; }
  };

  return (
    <div className="min-h-screen bg-void cyber-grid">
      <Navbar title="MES SESSIONS" showBack backTo="/dashboard" />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: MessageSquare, label: 'TOTAL SESSIONS', value: `${sessions.length}/5`, color: 'cyan' },
            { icon: Zap, label: 'QUESTIONS', value: stats.total_questions, color: 'purple' },
            { icon: Clock, label: 'LATENCE MOY.', value: `${stats.avg_latency}ms`, color: 'green' },
            { icon: TrendingUp, label: 'TEMPS TOTAL', value: `${Math.round(stats.total_duration / 60)}min`, color: 'orange' },
          ].map((s, i) => (
            <div key={i} className="cyber-card p-4" data-testid={`session-stat-${i}`}>
              <div className="flex items-center justify-between mb-2">
                <s.icon className={`w-5 h-5 text-cyber-${s.color}`} />
                <span className="text-xs text-slate-500 font-heading tracking-wider">{s.label}</span>
              </div>
              <p className={`text-2xl font-heading font-bold text-cyber-${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="cyber-card">
          <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
            <div>
              <h2 className="font-heading font-semibold text-lg tracking-wider" data-testid="sessions-list-title">HISTORIQUE DES SESSIONS</h2>
              <p className="text-sm text-slate-500">Consultez et gérez vos sessions passées</p>
            </div>
            <Link to="/interview">
              <button className="btn-primary text-xs py-2 px-4" data-testid="new-session-from-list">Nouvelle session</button>
            </Link>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-slate-800/30 animate-pulse" />)}</div>
            ) : sessions.length > 0 ? (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div key={session.id} className="p-4 bg-void border border-slate-800/50 hover:border-cyber-cyan/30 transition-colors" data-testid={`session-row-${session.id}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-heading text-sm">{session.title}</h3>
                        <span className={`px-2 py-0.5 text-xs font-heading tracking-wider ${
                          session.status === 'active' ? 'bg-cyber-green/10 text-cyber-green border border-cyber-green/30' :
                          session.status === 'paused' ? 'bg-cyber-orange/10 text-cyber-orange border border-cyber-orange/30' :
                          'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {session.status === 'active' ? 'ACTIF' : session.status === 'paused' ? 'PAUSE' : 'TERMINÉ'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to={`/interview/${session.id}`}>
                          <button className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1" data-testid={`view-session-${session.id}`}>
                            <Play className="w-3 h-3" /> {session.status === 'completed' ? 'Voir' : 'Reprendre'}
                          </button>
                        </Link>
                        <button
                          className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1"
                          onClick={() => handleDelete(session.id)}
                          disabled={deleting === session.id}
                          data-testid={`delete-session-row-${session.id}`}
                        >
                          {deleting === session.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Supprimer
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Calendar className="w-3 h-3" /> {formatDate(session.created_at)}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <MessageSquare className="w-3 h-3" /> {session.total_questions || 0} questions
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock className="w-3 h-3" /> {Math.round((session.duration_seconds || 0) / 60)} min
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <Zap className="w-3 h-3" /> {session.avg_latency_ms || 0}ms latence
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12" data-testid="no-sessions-list">
                <div className="w-16 h-16 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="font-heading text-lg mb-2 text-slate-300">AUCUNE SESSION</h3>
                <p className="text-sm text-slate-500 mb-4">Commencez votre première session</p>
                <Link to="/interview">
                  <button className="btn-primary text-xs py-2 px-6 flex items-center gap-2 mx-auto">
                    Démarrer <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
