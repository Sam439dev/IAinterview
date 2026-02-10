import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, MessageSquare, HelpCircle, Zap, Clock, Copy, Check, Loader2, ChevronDown, ChevronUp, Lightbulb, BarChart3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getSummary, generateSummary } from '../services/api';
import Navbar from '../components/Navbar';

export default function SessionSummary() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedQA, setExpandedQA] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const s = await getSummary(sessionId);
        if (s) setSummary(s);
        else {
          // Auto-generate if no summary exists
          setGenerating(true);
          try {
            const gen = await generateSummary(sessionId);
            setSummary(gen);
          } catch (e) {
            setError(e.response?.data?.detail || 'Erreur lors de la génération du résumé');
          } finally { setGenerating(false); }
        }
      } catch (e) {
        setError(e.response?.data?.detail || 'Erreur de chargement');
      } finally { setLoading(false); }
    })();
  }, [sessionId]);

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleQA = (i) => setExpandedQA(prev => ({ ...prev, [i]: !prev[i] }));

  const categoryLabels = {
    technique: { label: 'Technique', cls: 'chip-accent' },
    comportementale: { label: 'Comportementale', cls: 'chip-purple' },
    experience: { label: 'Expérience', cls: 'chip-success' },
    motivation: { label: 'Motivation', cls: 'chip-warn' },
    mise_en_situation: { label: 'Mise en situation', cls: 'chip-danger' },
    presentation: { label: 'Présentation', cls: 'chip-accent' },
    general: { label: 'Général', cls: 'chip-neutral' },
  };

  if (loading || generating) {
    return (
      <div className="min-h-screen bg-void">
        <Navbar title="Résumé" showBack backTo="/dashboard" />
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
          <p className="text-sm text-slate-400 font-display" data-testid="generating-msg">
            {generating ? 'Génération du résumé en cours...' : 'Chargement...'}
          </p>
          {generating && <p className="text-xs text-slate-600 mt-1">L'IA analyse l'ensemble de la conversation</p>}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void">
        <Navbar title="Résumé" showBack backTo="/dashboard" />
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <p className="text-sm text-red-400 mb-4" data-testid="error-msg">{error}</p>
          <button className="btn btn-outline text-xs" onClick={() => navigate('/dashboard')}>Retour au tableau de bord</button>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const insights = summary.session_insights || {};
  const transcript = summary.transcript || [];
  const questions = summary.identified_questions || [];
  const qaPairs = summary.qa_pairs || [];

  return (
    <div className="min-h-screen bg-void" data-testid="summary-page">
      <Navbar title="Résumé de session" showBack backTo="/dashboard" />

      <main className="max-w-4xl mx-auto px-5 py-8 space-y-6">
        {/* Insights header */}
        <div className="card p-5">
          <h1 className="font-display font-bold text-xl mb-4" data-testid="summary-title">Résumé de la session</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { icon: MessageSquare, label: 'Échanges', val: insights.total_exchanges || transcript.length, color: 'text-accent' },
              { icon: HelpCircle, label: 'Questions', val: insights.questions_detected || questions.length, color: 'text-accent2' },
              { icon: Zap, label: 'Paires Q/R', val: qaPairs.length, color: 'text-emerald-400' },
              { icon: BarChart3, label: 'Catégorie', val: insights.dominant_category || '—', color: 'text-amber-400' },
            ].map((s, i) => (
              <div key={i} className="card-inner p-3" data-testid={`insight-${i}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <span className="text-[0.65rem] text-slate-500 font-mono">{s.label}</span>
                </div>
                <p className={`text-lg font-display font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>
          {insights.general_feedback && (
            <div className="p-3 rounded-lg bg-accent2/[0.04] border border-accent2/10" data-testid="general-feedback">
              <p className="text-[0.65rem] text-accent2/70 font-display tracking-wider mb-1">FEEDBACK GÉNÉRAL</p>
              <p className="text-sm text-slate-300 leading-relaxed">{insights.general_feedback}</p>
            </div>
          )}
        </div>

        {/* Q/A Pairs */}
        {qaPairs.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent2" />
              <h2 className="font-display font-semibold text-sm" data-testid="qa-title">Paires Questions / Réponses</h2>
              <span className="chip chip-accent2 text-[0.6rem] ml-auto">{qaPairs.length} paires</span>
            </div>
            <div className="p-4 space-y-3">
              {qaPairs.map((qa, i) => {
                const cat = categoryLabels[qa.category] || categoryLabels.general;
                const isExpanded = expandedQA[i] !== false; // expanded by default
                return (
                  <div key={i} className="card-inner overflow-hidden" data-testid={`qa-pair-${i}`}>
                    {/* Question */}
                    <div className="p-4 border-b border-white/[0.04] cursor-pointer flex items-start gap-3" onClick={() => toggleQA(i)}>
                      <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <HelpCircle className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[0.65rem] text-slate-500 font-display tracking-wider">QUESTION</span>
                          {cat.label && <span className={`chip text-[0.55rem] ${cat.cls}`}>{cat.label}</span>}
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">{qa.question}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className="btn-ghost p-1" onClick={(e) => { e.stopPropagation(); copyText(qa.question, `q-${i}`); }}>
                          {copiedId === `q-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </div>
                    </div>
                    {/* Answer */}
                    {isExpanded && (
                      <div className="p-4 bg-accent2/[0.02] relative group">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <Lightbulb className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="text-[0.65rem] text-slate-500 font-display tracking-wider">RÉPONSE SUGGÉRÉE</span>
                        </div>
                        <div className="ai-md text-sm text-slate-300 leading-relaxed pl-9">
                          <ReactMarkdown>{qa.suggested_answer}</ReactMarkdown>
                        </div>
                        <button className="absolute top-3 right-3 btn btn-outline text-[0.6rem] py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyText(qa.suggested_answer, `a-${i}`)} data-testid={`copy-answer-${i}`}>
                          {copiedId === `a-${i}` ? <><Check className="w-3 h-3 text-emerald-400" /> Copié</> : <><Copy className="w-3 h-3" /> Copier</>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Identified Questions */}
        {questions.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-red-400" />
              <h2 className="font-display font-semibold text-sm" data-testid="questions-title">Questions identifiées</h2>
              <span className="chip chip-danger text-[0.6rem] ml-auto">{questions.length}</span>
            </div>
            <div className="p-4 space-y-2">
              {questions.map((q, i) => {
                const cat = categoryLabels[q.category] || categoryLabels.general;
                return (
                  <div key={i} className="card-inner p-3.5 flex items-start gap-3" data-testid={`question-${i}`}>
                    <span className="font-mono text-xs text-slate-600 mt-1">{String(i + 1).padStart(2, '0')}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {cat.label && <span className={`chip text-[0.55rem] ${cat.cls}`}>{cat.label}</span>}
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{q.question}</p>
                      {q.context && <p className="text-xs text-slate-500 mt-1">{q.context}</p>}
                    </div>
                    <button className="btn-ghost p-1 flex-shrink-0" onClick={() => copyText(q.question, `iq-${i}`)}>
                      {copiedId === `iq-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Transcript */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            <h2 className="font-display font-semibold text-sm" data-testid="transcript-title">Transcription complète</h2>
            <span className="chip chip-neutral text-[0.6rem] ml-auto">{transcript.length} messages</span>
          </div>
          <div className="p-4 space-y-2">
            {transcript.map((t, i) => {
              const isRecruiter = t.speaker?.toLowerCase().includes('recruteur');
              return (
                <div key={i} className={`p-3.5 rounded-lg relative group ${
                  isRecruiter ? 'bg-white/[0.02] border border-white/[0.04]' : 'bg-accent2/[0.03] border border-accent2/[0.06]'
                }`} data-testid={`transcript-line-${i}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`chip text-[0.55rem] ${isRecruiter ? 'chip-neutral' : 'chip-purple'}`}>
                      {isRecruiter ? 'Recruteur' : 'Suggestion IA'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed pr-8">{t.text}</p>
                  <button className="absolute top-3 right-3 btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyText(t.text, `tr-${i}`)}>
                    {copiedId === `tr-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 py-4">
          <Link to="/dashboard"><button className="btn btn-outline text-xs" data-testid="back-dashboard-btn">Retour au tableau de bord</button></Link>
          <Link to="/interview"><button className="btn btn-primary text-xs" data-testid="new-session-btn">Nouvelle session</button></Link>
        </div>
      </main>
    </div>
  );
}
