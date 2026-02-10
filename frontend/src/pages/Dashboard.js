import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, FileText, BarChart3, Settings, Clock, MessageSquare, Zap, TrendingUp, Calendar, Plus, Trash2, Play, AlertCircle, Loader2 } from 'lucide-react';
import { getSessions, getStats, deleteSession, getSettings, getActiveCV } from '../services/api';
import Navbar from '../components/Navbar';

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total_questions: 0, avg_latency: 0, total_duration: 0, total_sessions: 0 });
  const [settings, setSettings] = useState(null);
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    try {
      const [se, st, sett, cvd] = await Promise.all([getSessions(), getStats(), getSettings(), getActiveCV()]);
      setSessions(se || []);
      setStats(st);
      setSettings(sett);
      setCv(cvd);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleDel = async (id) => {
    if (!window.confirm('Supprimer cette session ?')) return;
    setDeleting(id);
    try { await deleteSession(id); load(); } catch (e) { console.error(e); }
    finally { setDeleting(null); }
  };

  const hasKey = settings?.has_key;
  const canCreate = (sessions?.length || 0) < 10;
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); } catch { return ''; } };

  if (loading) return <div className="h-screen bg-void flex items-center justify-center"><Loader2 className="w-6 h-6 text-accent animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-void">
      <Navbar title="Tableau de bord" />
      <main className="max-w-[1200px] mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl mb-1" data-testid="dashboard-title">
              Tableau de bord
            </h1>
            <p className="text-sm text-slate-500">Gérez vos sessions et suivez votre progression</p>
          </div>
          {canCreate && hasKey && (
            <Link to="/interview"><button className="btn btn-primary text-xs" data-testid="new-session-btn"><Plus className="w-4 h-4" /> Nouvelle session</button></Link>
          )}
        </div>

        {/* Key alert */}
        {!hasKey && (
          <div className="card p-4 mb-6 flex items-center gap-3 border-amber-500/20" data-testid="api-key-alert">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-400">Clé API OpenAI requise</p>
              <p className="text-xs text-slate-500">Configurez votre clé pour utiliser l'assistant</p>
            </div>
            <Link to="/settings"><button className="btn btn-outline text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10" data-testid="configure-btn">Configurer</button></Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            { icon: MessageSquare, label: 'Sessions', val: `${sessions.length}/10`, color: 'text-accent' },
            { icon: Zap, label: 'Questions', val: stats.total_questions, color: 'text-accent2' },
            { icon: Clock, label: 'Latence moy.', val: `${stats.avg_latency}ms`, color: 'text-emerald-400' },
            { icon: TrendingUp, label: 'Temps total', val: `${Math.round(stats.total_duration / 60)}min`, color: 'text-amber-400' },
          ].map((s, i) => (
            <div key={i} className="card p-4" data-testid={`stat-${i}`}>
              <div className="flex items-center justify-between mb-3">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-[0.65rem] text-slate-500 font-mono uppercase tracking-wider">{s.label}</span>
              </div>
              <p className={`text-xl font-display font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Sessions list */}
          <div className="lg:col-span-2">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
                <h2 className="font-display font-semibold text-sm tracking-wider" data-testid="sessions-heading">Mes sessions</h2>
                <Link to="/sessions" className="text-xs text-accent hover:text-accent/80 font-medium">Voir tout</Link>
              </div>
              <div className="p-3">
                {sessions.length > 0 ? (
                  <div className="space-y-2">
                    {sessions.slice(0, 5).map(s => (
                      <div key={s.id} className="card-inner p-3.5 flex items-center gap-3 group hover:border-accent/10" data-testid={`session-${s.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium truncate group-hover:text-accent transition-colors">{s.title}</h3>
                            <span className={`chip text-[0.6rem] ${
                              s.status === 'active' ? 'chip-success' : s.status === 'paused' ? 'chip-warn' : 'chip-neutral'
                            }`}>{s.status === 'active' ? 'Actif' : s.status === 'paused' ? 'Pause' : 'Terminé'}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[0.7rem] text-slate-500">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(s.created_at)}</span>
                            <span>{s.total_questions || 0} questions</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Link to={`/interview/${s.id}`}>
                            <button className="btn-ghost p-2" data-testid={`open-session-${s.id}`}><Play className="w-3.5 h-3.5" /></button>
                          </Link>
                          <button className="btn-ghost p-2 text-red-400 hover:bg-red-500/10" onClick={() => handleDel(s.id)} disabled={deleting === s.id} data-testid={`del-session-${s.id}`}>
                            {deleting === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12" data-testid="empty-sessions">
                    <div className="w-14 h-14 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                      <Mic className="w-7 h-7 text-slate-600" />
                    </div>
                    <p className="text-sm text-slate-400 mb-1 font-medium">Aucune session</p>
                    <p className="text-xs text-slate-500 mb-4">Lancez votre première session d'entraînement</p>
                    <Link to={hasKey ? '/interview' : '/settings'}>
                      <button className="btn btn-primary text-xs">{hasKey ? 'Démarrer' : 'Configurer d\'abord'}</button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* CV */}
            <div className="card p-5">
              <h3 className="font-display text-xs tracking-wider text-slate-500 mb-3 flex items-center gap-2" data-testid="cv-widget-title">
                <FileText className="w-3.5 h-3.5 text-emerald-400" /> MON CV
              </h3>
              {cv ? (
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid="cv-name">{cv.file_name}</p>
                      <p className="text-[0.65rem] text-slate-500">{cv.parsed_data?.skills?.length || 0} compétences</p>
                    </div>
                  </div>
                  {cv.parsed_data?.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cv.parsed_data.skills.slice(0, 4).map((s, i) => (
                        <span key={i} className="chip chip-accent text-[0.6rem]">{s}</span>
                      ))}
                      {cv.parsed_data.skills.length > 4 && <span className="chip chip-neutral text-[0.6rem]">+{cv.parsed_data.skills.length - 4}</span>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-xs text-slate-500 mb-2">Aucun CV uploadé</p>
                  <Link to="/settings"><button className="btn btn-outline text-xs py-1.5 px-3" data-testid="add-cv-btn">Ajouter</button></Link>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="card p-5">
              <h3 className="font-display text-xs tracking-wider text-slate-500 mb-3">ACTIONS RAPIDES</h3>
              <div className="space-y-1.5">
                {[
                  { to: '/interview', icon: Mic, label: 'Nouvelle session', color: 'text-accent' },
                  { to: '/sessions', icon: BarChart3, label: 'Analytics', color: 'text-accent2' },
                  { to: '/settings', icon: Settings, label: 'Paramètres', color: 'text-emerald-400' },
                ].map((a, i) => (
                  <Link key={i} to={a.to} className="block" data-testid={`action-${i}`}>
                    <div className="card-inner p-3 flex items-center gap-3 hover:border-accent/10 cursor-pointer transition-colors">
                      <a.icon className={`w-4 h-4 ${a.color}`} />
                      <span className="text-sm text-slate-300">{a.label}</span>
                    </div>
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
