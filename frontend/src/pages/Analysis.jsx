import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, FileText, MessageSquare, HelpCircle, Zap, Clock, Copy, Check, 
  Loader2, ChevronDown, ChevronUp, Lightbulb, BarChart3, Download, RefreshCw,
  TrendingUp, AlertTriangle, ThumbsUp, User, Users, Search, Filter
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getSummary, generateSummary, getMessages } from '../services/api';
import Navbar from '../components/Navbar';

// Performance metrics calculation
function calculateMetrics(transcript, startTime, endTime) {
  const durationMin = (endTime - startTime) / 60000 || 1;
  
  // Count words and calculate WPM
  let totalWords = 0;
  let candidateWords = 0;
  let interviewerSegments = 0;
  let candidateSegments = 0;
  
  // Filler word detection
  const fillerPatterns = {
    'euh': 0, 'heu': 0, 'um': 0, 'uh': 0, 'like': 0, 
    'donc': 0, 'voila': 0, 'genre': 0, 'basically': 0
  };
  
  transcript.forEach(t => {
    const text = t.text || '';
    const words = text.split(/\s+/).filter(w => w.length > 0);
    totalWords += words.length;
    
    const isCandidate = t.speaker?.toLowerCase().includes('you') || 
                        t.speaker?.toLowerCase().includes('candidate') ||
                        t.speaker === 'candidate';
    
    if (isCandidate) {
      candidateWords += words.length;
      candidateSegments++;
    } else {
      interviewerSegments++;
    }
    
    // Count filler words
    const lower = text.toLowerCase();
    Object.keys(fillerPatterns).forEach(filler => {
      const matches = lower.match(new RegExp(`\\b${filler}\\b`, 'gi'));
      if (matches) fillerPatterns[filler] += matches.length;
    });
  });
  
  const totalFillers = Object.values(fillerPatterns).reduce((a, b) => a + b, 0);
  const fillersPerMinute = (totalFillers / durationMin).toFixed(1);
  const wordsPerMinute = Math.round(candidateWords / durationMin);
  
  // Speaking pace assessment
  let paceAssessment = 'Normal';
  let paceColor = 'text-emerald-400';
  if (wordsPerMinute < 120) {
    paceAssessment = 'Lent';
    paceColor = 'text-amber-400';
  } else if (wordsPerMinute > 180) {
    paceAssessment = 'Rapide';
    paceColor = 'text-red-400';
  }
  
  return {
    totalWords,
    candidateWords,
    interviewerSegments,
    candidateSegments,
    durationMin: Math.round(durationMin),
    wordsPerMinute,
    paceAssessment,
    paceColor,
    fillerPatterns,
    totalFillers,
    fillersPerMinute
  };
}

// Metric Card Component
function MetricCard({ icon: Icon, label, value, subValue, color = 'text-accent', trend }) {
  return (
    <div className="card-inner p-4" data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-[0.7rem] text-slate-500 font-display uppercase tracking-wider">{label}</span>
        </div>
        {trend && (
          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded ${
            trend === 'good' ? 'bg-emerald-500/20 text-emerald-400' :
            trend === 'warning' ? 'bg-amber-500/20 text-amber-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {trend === 'good' ? 'Bien' : trend === 'warning' ? 'Attention' : 'A ameliorer'}
          </span>
        )}
      </div>
      <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
      {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
    </div>
  );
}

// Filler Word Badge
function FillerBadge({ word, count }) {
  const getBgColor = (c) => {
    if (c >= 5) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (c >= 3) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };
  
  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getBgColor(count)}`}>
      "{word}" x{count}
    </span>
  );
}

// Transcript Line with highlighting
function TranscriptLine({ line, index, isQuestion, searchTerm, onCopy, copiedId }) {
  const isInterviewer = line.speaker?.toLowerCase().includes('interviewer') || 
                        line.speaker?.toLowerCase().includes('recruteur');
  
  const highlightText = (text) => {
    if (!searchTerm) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchTerm.toLowerCase() 
        ? <mark key={i} className="bg-amber-500/30 text-white px-0.5 rounded">{part}</mark>
        : part
    );
  };

  return (
    <div 
      className={`p-3.5 rounded-lg relative group transition-all ${
        isQuestion 
          ? 'bg-amber-500/10 border border-amber-500/20 shadow-lg shadow-amber-500/5'
          : isInterviewer 
            ? 'bg-purple-500/5 border border-purple-500/10' 
            : 'bg-cyan-500/5 border border-cyan-500/10'
      }`}
      data-testid={`transcript-line-${index}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`chip text-[0.55rem] ${
          isInterviewer ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'
        }`}>
          {isInterviewer ? 'Interviewer' : 'Vous'}
        </span>
        {isQuestion && (
          <span className="chip chip-warn text-[0.55rem]">
            <Zap className="w-2.5 h-2.5" /> Question
          </span>
        )}
        {line.timestamp && (
          <span className="text-[0.6rem] text-slate-600 font-mono ml-auto">{line.timestamp}</span>
        )}
      </div>
      <p className="text-sm text-slate-300 leading-relaxed pr-8">
        {highlightText(line.text || '')}
      </p>
      <button 
        className="absolute top-3 right-3 btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onCopy(line.text, `tr-${index}`)}
      >
        {copiedId === `tr-${index}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

export default function Analysis() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  
  const [summary, setSummary] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedQA, setExpandedQA] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeaker, setFilterSpeaker] = useState('all');
  const [summaryLength, setSummaryLength] = useState('detailed');
  
  // Load data
  useEffect(() => {
    (async () => {
      try {
        // Load messages for metrics calculation
        const msgs = await getMessages(sessionId);
        setMessages(msgs || []);
        
        // Load or generate summary
        const s = await getSummary(sessionId);
        if (s) {
          setSummary(s);
        } else {
          setGenerating(true);
          try {
            const gen = await generateSummary(sessionId);
            setSummary(gen);
          } catch (e) {
            setError(e.response?.data?.detail || 'Erreur lors de la generation du resume');
          } finally { 
            setGenerating(false); 
          }
        }
      } catch (e) {
        setError(e.response?.data?.detail || 'Erreur de chargement');
      } finally { 
        setLoading(false); 
      }
    })();
  }, [sessionId]);

  const copyText = useCallback((text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const toggleQA = (i) => setExpandedQA(prev => ({ ...prev, [i]: !prev[i] }));
  
  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const gen = await generateSummary(sessionId);
      setSummary(gen);
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur');
    } finally {
      setRegenerating(false);
    }
  };

  const handleExportPDF = () => {
    // Create printable content and trigger print
    window.print();
  };

  const handleExportText = () => {
    const content = {
      session_id: sessionId,
      summary: summary,
      messages: messages,
      exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-analysis-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    if (!messages.length) return null;
    const startTime = messages[0]?.created_at ? new Date(messages[0].created_at).getTime() : Date.now();
    const endTime = messages[messages.length - 1]?.created_at 
      ? new Date(messages[messages.length - 1].created_at).getTime() 
      : Date.now();
    
    const transcript = messages.map(m => ({
      text: m.content,
      speaker: m.role === 'user' ? 'interviewer' : 'candidate'
    }));
    
    return calculateMetrics(transcript, startTime, endTime);
  }, [messages]);

  // Filter transcript
  const filteredTranscript = useMemo(() => {
    let transcript = summary?.transcript || [];
    
    if (searchTerm) {
      transcript = transcript.filter(t => 
        t.text?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterSpeaker !== 'all') {
      transcript = transcript.filter(t => {
        const isInterviewer = t.speaker?.toLowerCase().includes('interviewer') || 
                              t.speaker?.toLowerCase().includes('recruteur');
        return filterSpeaker === 'interviewer' ? isInterviewer : !isInterviewer;
      });
    }
    
    return transcript;
  }, [summary, searchTerm, filterSpeaker]);

  const categoryLabels = {
    technique: { label: 'Technique', cls: 'chip-accent' },
    comportementale: { label: 'Comportementale', cls: 'chip-purple' },
    experience: { label: 'Experience', cls: 'chip-success' },
    motivation: { label: 'Motivation', cls: 'chip-warn' },
    mise_en_situation: { label: 'Mise en situation', cls: 'chip-danger' },
    presentation: { label: 'Presentation', cls: 'chip-accent' },
    general: { label: 'General', cls: 'chip-neutral' },
  };

  if (loading || generating) {
    return (
      <div className="min-h-screen bg-void">
        <Navbar title="Analyse" showBack backTo="/dashboard" />
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <Loader2 className="w-10 h-10 text-accent animate-spin mb-4" />
          <p className="text-sm text-slate-400 font-display" data-testid="generating-msg">
            {generating ? 'Generation de l\'analyse en cours...' : 'Chargement...'}
          </p>
          {generating && (
            <div className="mt-4 space-y-2 text-center">
              <p className="text-xs text-slate-600">L'IA analyse l'ensemble de la conversation</p>
              <div className="flex items-center justify-center gap-2">
                {['Transcription', 'Questions', 'Metriques', 'Feedback'].map((step, i) => (
                  <span key={i} className="text-[0.6rem] px-2 py-1 rounded bg-white/5 text-slate-500">
                    {step}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void">
        <Navbar title="Analyse" showBack backTo="/dashboard" />
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-4" />
          <p className="text-sm text-red-400 mb-4" data-testid="error-msg">{error}</p>
          <button className="btn btn-outline text-xs" onClick={() => navigate('/dashboard')}>
            Retour au tableau de bord
          </button>
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
    <div className="min-h-screen bg-void print:bg-white" data-testid="analysis-page">
      <Navbar title="Analyse de session" showBack backTo="/dashboard" />

      <main className="max-w-5xl mx-auto px-5 py-8 space-y-6">
        {/* Header with Export Options */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl" data-testid="analysis-title">
              Analyse Post-Entretien
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Session du {new Date().toLocaleDateString('fr-FR')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="btn btn-outline text-xs"
              onClick={handleRegenerate}
              disabled={regenerating}
              data-testid="regenerate-btn"
            >
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Regenerer
            </button>
            <button 
              className="btn btn-outline text-xs"
              onClick={handleExportText}
              data-testid="export-json-btn"
            >
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
            <button 
              className="btn btn-primary text-xs print:hidden"
              onClick={handleExportPDF}
              data-testid="export-pdf-btn"
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>

        {/* Performance Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard 
            icon={MessageSquare} 
            label="Echanges" 
            value={insights.total_exchanges || transcript.length}
            color="text-accent"
          />
          <MetricCard 
            icon={HelpCircle} 
            label="Questions" 
            value={insights.questions_detected || questions.length}
            color="text-amber-400"
          />
          <MetricCard 
            icon={Zap} 
            label="Suggestions" 
            value={qaPairs.length}
            color="text-emerald-400"
          />
          <MetricCard 
            icon={Clock} 
            label="Duree" 
            value={`${metrics?.durationMin || '?'}min`}
            color="text-cyan-400"
          />
          <MetricCard 
            icon={TrendingUp} 
            label="Rythme" 
            value={`${metrics?.wordsPerMinute || '?'}`}
            subValue="mots/min"
            color={metrics?.paceColor || 'text-slate-400'}
            trend={metrics?.wordsPerMinute >= 120 && metrics?.wordsPerMinute <= 180 ? 'good' : 'warning'}
          />
          <MetricCard 
            icon={AlertTriangle} 
            label="Fillers" 
            value={metrics?.totalFillers || 0}
            subValue={`${metrics?.fillersPerMinute || 0}/min`}
            color={metrics?.totalFillers > 10 ? 'text-red-400' : 'text-slate-400'}
            trend={metrics?.totalFillers < 5 ? 'good' : metrics?.totalFillers < 10 ? 'warning' : 'bad'}
          />
        </div>

        {/* Filler Words Breakdown */}
        {metrics?.totalFillers > 0 && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-display text-slate-400 uppercase tracking-wider">Mots de remplissage detectes</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metrics.fillerPatterns)
                .filter(([_, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([word, count]) => (
                  <FillerBadge key={word} word={word} count={count} />
                ))
              }
            </div>
          </div>
        )}

        {/* AI Feedback */}
        {insights.general_feedback && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <ThumbsUp className="w-5 h-5 text-accent2" />
              <h2 className="font-display font-semibold text-sm">Feedback IA</h2>
            </div>
            <div className="p-4 rounded-lg bg-accent2/[0.04] border border-accent2/10">
              <p className="text-sm text-slate-300 leading-relaxed">{insights.general_feedback}</p>
            </div>
            
            {/* Length toggle for regeneration */}
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs text-slate-500">Format:</span>
              {['brief', 'detailed'].map(len => (
                <button
                  key={len}
                  className={`text-xs px-3 py-1 rounded-lg transition-all ${
                    summaryLength === len 
                      ? 'bg-accent/20 text-accent border border-accent/30' 
                      : 'bg-white/5 text-slate-500 hover:text-white'
                  }`}
                  onClick={() => setSummaryLength(len)}
                >
                  {len === 'brief' ? 'Bref' : 'Detaille'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Q/A Pairs Section */}
        {qaPairs.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent2" />
              <h2 className="font-display font-semibold text-sm" data-testid="qa-title">
                Questions et Reponses Suggerees
              </h2>
              <span className="chip chip-accent2 text-[0.6rem] ml-auto">{qaPairs.length}</span>
            </div>
            <div className="p-4 space-y-3">
              {qaPairs.map((qa, i) => {
                const cat = categoryLabels[qa.category] || categoryLabels.general;
                const isExpanded = expandedQA[i] !== false;
                return (
                  <div key={i} className="card-inner overflow-hidden" data-testid={`qa-pair-${i}`}>
                    <div 
                      className="p-4 border-b border-white/[0.04] cursor-pointer flex items-start gap-3" 
                      onClick={() => toggleQA(i)}
                    >
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <HelpCircle className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[0.65rem] text-slate-500 font-display tracking-wider">QUESTION</span>
                          {cat.label && <span className={`chip text-[0.55rem] ${cat.cls}`}>{cat.label}</span>}
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">{qa.question}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button 
                          className="btn-ghost p-1" 
                          onClick={(e) => { e.stopPropagation(); copyText(qa.question, `q-${i}`); }}
                        >
                          {copiedId === `q-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="p-4 bg-accent2/[0.02] relative group">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <Lightbulb className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="text-[0.65rem] text-slate-500 font-display tracking-wider">REPONSE SUGGEREE</span>
                        </div>
                        <div className="ai-md text-sm text-slate-300 leading-relaxed pl-9">
                          <ReactMarkdown>{qa.suggested_answer}</ReactMarkdown>
                        </div>
                        <button 
                          className="absolute top-3 right-3 btn btn-outline text-[0.6rem] py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyText(qa.suggested_answer, `a-${i}`)} 
                          data-testid={`copy-answer-${i}`}
                        >
                          {copiedId === `a-${i}` ? <><Check className="w-3 h-3 text-emerald-400" /> Copie</> : <><Copy className="w-3 h-3" /> Copier</>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Transcript with Search/Filter */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                <h2 className="font-display font-semibold text-sm" data-testid="transcript-title">
                  Transcription Complete
                </h2>
                <span className="chip chip-neutral text-[0.6rem]">{transcript.length}</span>
              </div>
            </div>
            
            {/* Search and Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input text-xs pl-9 py-2"
                  data-testid="transcript-search"
                />
              </div>
              <select
                value={filterSpeaker}
                onChange={(e) => setFilterSpeaker(e.target.value)}
                className="input text-xs py-2 w-40"
                data-testid="speaker-filter"
              >
                <option value="all">Tous</option>
                <option value="interviewer">Interviewer</option>
                <option value="candidate">Vous</option>
              </select>
            </div>
          </div>
          
          <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
            {filteredTranscript.length > 0 ? (
              filteredTranscript.map((t, i) => (
                <TranscriptLine
                  key={i}
                  line={t}
                  index={i}
                  isQuestion={t.text?.trim().endsWith('?')}
                  searchTerm={searchTerm}
                  onCopy={copyText}
                  copiedId={copiedId}
                />
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Aucun resultat pour "{searchTerm}"</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 py-4 print:hidden">
          <Link to="/dashboard">
            <button className="btn btn-outline text-xs" data-testid="back-dashboard-btn">
              Retour au tableau de bord
            </button>
          </Link>
          <Link to="/interview">
            <button className="btn btn-primary text-xs" data-testid="new-session-btn">
              Nouvelle session
            </button>
          </Link>
        </div>
      </main>

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
          body { background: white; }
          .card { border: 1px solid #ddd; margin-bottom: 1rem; }
        }
      `}</style>
    </div>
  );
}
