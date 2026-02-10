import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Mic, FileText, BarChart3, Settings, Clock, MessageSquare, Zap, TrendingUp, Calendar, ChevronRight, Plus, Trash2, Play, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { getSessions, getSessionStats, deleteSession as apiDeleteSession, getSettings, getActiveCV } from '../services/api';
import Navbar from '../components/Navbar';

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total_questions: 0, avg_latency: 0, total_duration: 0 });
  const [settings, setSettings] = useState(null);
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchData = async () => {
    try {
      const [sess, st, sett, cvData] = await Promise.all([
        getSessions(),
        getSessionStats(),
        getSettings(),
        getActiveCV()
      ]);
      setSessions(sess || []);
      setStats(st);
      setSettings(sett);
      setCv(cvData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette session ? Cette action est irréversible.')) return;
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

  const hasKey = settings?.has_key;
  const canCreate = (sessions?.length || 0) < 5;

  const formatDate = (d) => {
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return ''; }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-void cyber-grid flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyber-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void cyber-grid">
      <Navbar title="TABLEAU DE BORD" />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="font-heading font-bold text-3xl mb-2" data-testid="dashboard-title">
            Bienvenue, <span className="text-cyber-cyan text-glow-cyan">Champion</span>
          </h1>
          <p className="text-slate-400">Prêt à dominer votre prochain entretien technique ?</p>
        </div>

        {/* API Key Alert */}
        {!hasKey && (
          <div className="mb-8 p-4 border border-cyber-orange/30 bg-cyber-orange/5 flex items-start gap-3" data-testid="api-key-alert">
            <AlertCircle className="w-5 h-5 text-cyber-orange flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-heading text-sm text-cyber-orange mb-1 tracking-wider">CONFIGURATION REQUISE</h3>
              <p className="text-sm text-slate-400 mb-3">
                Pour utiliser l'assistant, configurez votre clé API OpenAI dans les paramètres.
              </p>
              <Link to="/settings">
                <button className="btn-secondary text-xs py-2 px-4 border-cyber-orange text-cyber-orange hover:bg-cyber-orange/10">
                  <Settings className="w-3 h-3 inline mr-2" /> Configurer
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: MessageSquare, label: 'SESSIONS', value: `${sessions.length}/5`, color: 'cyan' },
            { icon: Zap, label: 'QUESTIONS', value: stats.total_questions, color: 'purple' },
            { icon: Clock, label: 'LATENCE MOY.', value: `${stats.avg_latency}ms`, color: 'green' },
            { icon: TrendingUp, label: 'TEMPS TOTAL', value: `${Math.round(stats.total_duration / 60)}min`, color: 'orange' },
          ].map((s, i) => (
            <div key={i} className="cyber-card p-4" data-testid={`stat-card-${i}`}>
              <div className="flex items-center justify-between mb-2">
                <s.icon className={`w-5 h-5 text-cyber-${s.color}`} />
                <span className="text-xs text-slate-500 font-heading tracking-wider">{s.label}</span>
              </div>
              <p className={`text-2xl font-heading font-bold text-cyber-${s.color} text-glow-${s.color}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Sessions */}
          <div className="lg:col-span-2">
            <div className="cyber-card">
              <div className="flex items-center justify-between p-6 border-b border-slate-800/50">
                <div>
                  <h2 className="font-heading font-semibold text-lg tracking-wider" data-testid="sessions-title">MES SESSIONS</h2>
                  <p className="text-sm text-slate-500">{sessions.length}/5 sessions utilisées</p>
                </div>
                {canCreate && hasKey && (
                  <Link to="/interview" data-testid="new-session-btn">
                    <button className="btn-primary text-xs py-2 px-4 flex items-center gap-2">
                      <Plus className="w-3 h-3" /> Nouvelle
                    </button>
                  </Link>
                )}
              </div>
              <div className="p-6">
                {sessions.length > 0 ? (
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div key={session.id} className="p-4 bg-void border border-slate-800/50 hover:border-cyber-cyan/30 transition-colors group" data-testid={`session-item-${session.id}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-heading text-sm mb-1 group-hover:text-cyber-cyan transition-colors">{session.title}</h3>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {formatDate(session.created_at)}
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> {session.total_questions || 0} questions
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {Math.round((session.duration_seconds || 0) / 60)}min
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs font-heading tracking-wider ${
                              session.status === 'active' ? 'bg-cyber-green/10 text-cyber-green border border-cyber-green/30' :
                              session.status === 'paused' ? 'bg-cyber-orange/10 text-cyber-orange border border-cyber-orange/30' :
                              'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {session.status === 'active' ? 'ACTIF' : session.status === 'paused' ? 'PAUSE' : 'TERMINÉ'}
                            </span>
                            <Link to={`/interview/${session.id}`}>
                              <button className="btn-ghost p-1.5" data-testid={`resume-session-${session.id}`}>
                                <Play className="w-4 h-4" />
                              </button>
                            </Link>
                            <button
                              className="btn-ghost p-1.5 text-cyber-magenta hover:bg-cyber-magenta/10"
                              onClick={() => handleDelete(session.id)}
                              disabled={deleting === session.id}
                              data-testid={`delete-session-${session.id}`}
                            >
                              {deleting === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12" data-testid="no-sessions">
                    <div className="w-16 h-16 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                      <Mic className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="font-heading text-lg mb-2 text-slate-300">AUCUNE SESSION</h3>
                    <p className="text-sm text-slate-500 mb-4">Commencez votre première session d'entraînement</p>
                    <Link to={hasKey ? '/interview' : '/settings'}>
                      <button className="btn-primary text-xs py-2 px-6">
                        {hasKey ? 'Démarrer' : 'Configurer d\'abord'}
                      </button>
                    </Link>
                  </div>
                )}

                {!canCreate && (
                  <div className="mt-4 p-3 border border-cyber-magenta/30 bg-cyber-magenta/5">
                    <p className="text-sm text-cyber-magenta flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Limite de 5 sessions atteinte. Supprimez une session pour en créer une nouvelle.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* CV Widget */}
            <div className="cyber-card p-6">
              <h3 className="font-heading text-sm tracking-wider mb-4 flex items-center gap-2 text-slate-400">
                <FileText className="w-4 h-4 text-cyber-green" /> MON CV
              </h3>
              {cv ? (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-cyber-green/10 border border-cyber-green/30 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-cyber-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid="cv-filename">{cv.file_name}</p>
                      <p className="text-xs text-slate-500">{cv.parsed_data?.skills?.length || 0} compétences</p>
                    </div>
                  </div>
                  {cv.parsed_data?.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cv.parsed_data.skills.slice(0, 5).map((s, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20">{s}</span>
                      ))}
                      {cv.parsed_data.skills.length > 5 && (
                        <span className="px-2 py-0.5 text-xs bg-slate-800 text-slate-400">+{cv.parsed_data.skills.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-slate-500 mb-3">Aucun CV uploadé</p>
                  <Link to="/settings">
                    <button className="btn-secondary text-xs py-2 px-4">
                      <Plus className="w-3 h-3 inline mr-1" /> Ajouter un CV
                    </button>
                  </Link>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="cyber-card p-6">
              <h3 className="font-heading text-sm tracking-wider mb-4 text-slate-400">ACTIONS RAPIDES</h3>
              <div className="space-y-2">
                {[
                  { to: '/interview', icon: Mic, label: 'Nouvelle session', color: 'cyan' },
                  { to: '/sessions', icon: BarChart3, label: 'Voir analytics', color: 'purple' },
                  { to: '/settings', icon: Settings, label: 'Paramètres', color: 'green' },
                ].map((a, i) => (
                  <Link key={i} to={a.to} className="block" data-testid={`quick-action-${i}`}>
                    <button className="w-full text-left btn-secondary text-xs py-3 px-4 flex items-center gap-3 border-slate-800 hover:border-cyber-cyan/30">
                      <a.icon className={`w-4 h-4 text-cyber-${a.color}`} />
                      {a.label}
                    </button>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
