import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Clock, Loader2, AlertCircle, Copy, Check, Zap, ChevronDown, MessageSquare, FileText, Lightbulb, CornerDownLeft, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getSettings, createSession, updateSession, getMessages, processText, getActiveCV, generateSummary } from '../services/api';

export default function Interview() {
  const { sessionId: paramId } = useParams();
  const navigate = useNavigate();

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]); // all messages: user (interviewer) + assistant (suggestions)
  const [suggestions, setSuggestions] = useState([]);
  const [sessionId, setSessionId] = useState(paramId || null);
  const [settings, setSettings] = useState(null);
  const [cvActive, setCvActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [showPanel, setShowPanel] = useState('suggestions');
  const [questionCount, setQuestionCount] = useState(0);

  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const suggestionsEndRef = useRef(null);

  // Load initial data
  useEffect(() => {
    (async () => {
      try {
        const [sett, cv] = await Promise.all([getSettings(), getActiveCV()]);
        setSettings(sett);
        setCvActive(!!cv);
        if (paramId) {
          const msgs = await getMessages(paramId);
          if (msgs?.length) {
            const userMsgs = [];
            const aiSugs = [];
            let qCount = 0;
            msgs.forEach(m => {
              if (m.role === 'user') {
                userMsgs.push({ id: m.id, text: m.content, time: new Date(m.created_at) });
              } else {
                qCount++;
                aiSugs.push({
                  id: m.id, response: m.content, category: m.category || 'general',
                  keyPoints: m.key_points || [], toneAdvice: m.tone_advice,
                  questionSummary: m.question_summary, confidence: m.confidence || 0,
                  time: new Date(m.created_at), ms: m.response_ms
                });
              }
            });
            setMessages(userMsgs);
            setSuggestions(aiSugs);
            setQuestionCount(qCount);
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [paramId]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { suggestionsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [suggestions]);

  const hasKey = settings?.has_key;

  // Submit what the interviewer said
  const handleSubmit = useCallback(async () => {
    const text = inputText.trim();
    if (!text || processing || !hasKey) return;

    let sid = sessionId;
    if (!sid) {
      try {
        const s = await createSession({ title: `Session du ${new Date().toLocaleDateString('fr-FR')}` });
        sid = s.id;
        setSessionId(sid);
        navigate(`/interview/${sid}`, { replace: true });
      } catch { return; }
    }

    // Add to messages immediately
    const msgId = `msg-${Date.now()}`;
    setMessages(prev => [...prev, { id: msgId, text, time: new Date() }]);
    setInputText('');
    setProcessing(true);

    try {
      const result = await processText({ session_id: sid, text, language: 'fr' });

      if (result.detected && result.suggested_response) {
        setQuestionCount(prev => prev + 1);
        setSuggestions(prev => [...prev, {
          id: `sug-${Date.now()}`,
          response: result.suggested_response,
          category: result.category || 'general',
          keyPoints: result.key_points || [],
          toneAdvice: result.tone_advice,
          questionSummary: result.question_summary,
          confidence: result.confidence || 0,
          time: new Date(),
          ms: result.response_ms,
          cvUsed: result.cv_active,
          originalText: text
        }]);
        // Switch to suggestions panel on mobile
        setShowPanel('suggestions');
      }
    } catch (e) { console.error('Process error:', e); }
    finally { setProcessing(false); inputRef.current?.focus(); }
  }, [inputText, processing, hasKey, sessionId, navigate]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const categoryLabels = {
    question_technique: { label: 'Technique', cls: 'chip-accent' },
    question_comportementale: { label: 'Comportementale', cls: 'chip-purple' },
    question_experience: { label: 'Expérience', cls: 'chip-success' },
    question_motivation: { label: 'Motivation', cls: 'chip-warn' },
    mise_en_situation: { label: 'Mise en situation', cls: 'chip-danger' },
    presentation: { label: 'Présentation', cls: 'chip-accent' },
    general: { label: 'Général', cls: 'chip-neutral' },
    none: { label: '', cls: '' },
  };

  if (loading) return <div className="h-screen bg-void flex items-center justify-center"><Loader2 className="w-6 h-6 text-accent animate-spin" /></div>;

  return (
    <div className="h-screen bg-void flex flex-col" data-testid="interview-page">
      {/* Top bar */}
      <header className="h-12 border-b border-white/[0.04] bg-void/80 backdrop-blur-xl flex items-center px-4 gap-3 flex-shrink-0 z-50">
        <Link to="/dashboard" className="btn-ghost p-1.5" data-testid="interview-back"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="w-px h-5 bg-white/[0.06]" />
        <span className="font-display text-xs text-slate-500 tracking-wider hidden sm:block">
          {sessionId ? 'SESSION' : 'NOUVELLE SESSION'}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {cvActive && <span className="chip chip-success text-[0.6rem]" data-testid="cv-badge"><FileText className="w-3 h-3" /> CV actif</span>}
          <span className="chip chip-accent text-[0.6rem]" data-testid="question-count">
            <Zap className="w-3 h-3" /> {questionCount} question{questionCount !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {/* Mobile toggle */}
      <div className="lg:hidden flex border-b border-white/[0.04]">
        <button className={`flex-1 py-2.5 text-xs font-display tracking-wider transition-colors ${showPanel === 'conversation' ? 'text-accent border-b-2 border-accent' : 'text-slate-500'}`}
          onClick={() => setShowPanel('conversation')} data-testid="mobile-conv-tab">
          Conversation ({messages.length})
        </button>
        <button className={`flex-1 py-2.5 text-xs font-display tracking-wider transition-colors ${showPanel === 'suggestions' ? 'text-accent border-b-2 border-accent' : 'text-slate-500'}`}
          onClick={() => setShowPanel('suggestions')} data-testid="mobile-sug-tab">
          Suggestions {suggestions.length > 0 && <span className="ml-1 inline-flex items-center justify-center w-5 h-5 bg-accent/20 text-accent rounded-full text-[0.6rem]">{suggestions.length}</span>}
        </button>
      </div>

      {/* Main split view */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT: Conversation - what the interviewer said */}
        <div className={`w-full lg:w-[45%] flex flex-col border-r border-white/[0.04] ${showPanel !== 'conversation' && showPanel !== 'suggestions' ? '' : showPanel === 'conversation' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-accent" />
            <h2 className="font-display text-xs tracking-wider text-slate-500">CE QUE DIT LE RECRUTEUR</h2>
            <div className="flex-1" />
            <span className="text-[0.65rem] text-slate-600 font-mono">{messages.length} messages</span>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5" data-testid="conversation-panel">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full" data-testid="conv-empty">
                <div className="text-center max-w-xs">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-7 h-7 text-slate-700" />
                  </div>
                  <p className="text-sm text-slate-400 mb-1 font-medium">En attente</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Saisissez ce que le recruteur dit ou demande. L'IA analysera et vous proposera des réponses personnalisées.
                  </p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={m.id} className="fade-up" data-testid={`message-${i}`}>
                <div className="card-inner p-3.5 group relative">
                  <p className="text-sm text-slate-200 leading-relaxed pr-7">{m.text}</p>
                  <button className="absolute top-2.5 right-2.5 btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyText(m.text, m.id)}>
                    {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <span className="text-[0.6rem] text-slate-600 font-mono mt-1.5 block">
                    {m.time?.toLocaleTimeString?.('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {processing && (
              <div className="flex items-center gap-2.5 p-3 card-inner border-amber-500/10 fade-up" data-testid="processing-indicator">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-xs text-amber-400 font-display">Analyse en cours...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Text input */}
          <div className="p-3 border-t border-white/[0.04] bg-base/80 backdrop-blur-sm" data-testid="input-area">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasKey
                  ? "Saisissez ce que le recruteur dit ou demande..."
                  : "Configurez votre clé API dans les paramètres"
                }
                disabled={!hasKey || processing}
                rows={2}
                className="input resize-none pr-12 text-sm leading-relaxed"
                data-testid="interviewer-input"
              />
              <button
                className="absolute right-2 bottom-2 btn btn-primary p-2 rounded-lg disabled:opacity-30"
                onClick={handleSubmit}
                disabled={!inputText.trim() || processing || !hasKey}
                data-testid="send-btn"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <span className="text-[0.6rem] text-slate-600 flex items-center gap-1">
                <CornerDownLeft className="w-3 h-3" /> Entrée pour envoyer
              </span>
              {!hasKey && (
                <Link to="/settings" className="text-[0.65rem] text-amber-400 hover:underline flex items-center gap-1" data-testid="config-link">
                  <AlertCircle className="w-3 h-3" /> Configurer la clé API
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: AI Suggestions */}
        <div className={`w-full lg:w-[55%] flex flex-col ${showPanel === 'suggestions' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-accent2" />
            <h2 className="font-display text-xs tracking-wider text-slate-500">SUGGESTIONS DE RÉPONSES</h2>
            <div className="flex-1" />
            <span className="text-[0.65rem] text-slate-600 font-mono">{suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="suggestions-panel">
            {suggestions.length === 0 && (
              <div className="flex items-center justify-center h-full" data-testid="sug-empty">
                <div className="text-center max-w-xs">
                  <div className="w-14 h-14 rounded-2xl bg-accent2/[0.04] border border-accent2/10 flex items-center justify-center mx-auto mb-4">
                    <Lightbulb className="w-7 h-7 text-accent2/30" />
                  </div>
                  <p className="text-sm text-slate-400 mb-1 font-medium">En attente de questions</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Lorsqu'une question ou demande est détectée, une suggestion de réponse personnalisée apparaîtra ici.
                  </p>
                </div>
              </div>
            )}
            {suggestions.map((s, i) => (
              <SuggestionCard key={s.id} suggestion={s} index={i} onCopy={copyText} copiedId={copiedId} categoryLabels={categoryLabels} />
            ))}
            <div ref={suggestionsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion: s, index, onCopy, copiedId, categoryLabels }) {
  const [expanded, setExpanded] = useState(true);
  const cat = categoryLabels[s.category] || categoryLabels.general;

  return (
    <div className="card fade-up overflow-hidden" data-testid={`suggestion-${index}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
        <Zap className="w-3.5 h-3.5 text-accent2" />
        {cat.label && <span className={`chip text-[0.6rem] ${cat.cls}`}>{cat.label}</span>}
        {s.confidence > 0 && <span className="chip chip-neutral text-[0.6rem]">{Math.round(s.confidence * 100)}%</span>}
        <div className="flex-1" />
        {s.ms && <span className="text-[0.6rem] text-slate-600 font-mono">{(s.ms / 1000).toFixed(1)}s</span>}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Question summary */}
          {s.questionSummary && (
            <div className="p-3 rounded-lg bg-accent/[0.04] border border-accent/10">
              <p className="text-[0.65rem] text-accent/70 font-display tracking-wider mb-1">QUESTION / INTENTION DÉTECTÉE</p>
              <p className="text-sm text-slate-300">{s.questionSummary}</p>
            </div>
          )}

          {/* AI Suggested Response */}
          <div className="relative group">
            <div className="p-3 rounded-lg bg-accent2/[0.03] border border-accent2/[0.08]">
              <p className="text-[0.65rem] text-accent2/70 font-display tracking-wider mb-2">SUGGESTION DE RÉPONSE</p>
              <div className="ai-md text-sm text-slate-300 leading-relaxed">
                <ReactMarkdown>{s.response}</ReactMarkdown>
              </div>
            </div>
            <button className="absolute top-2 right-2 btn btn-outline text-[0.65rem] py-1 px-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopy(s.response, s.id)} data-testid={`copy-suggestion-${index}`}>
              {copiedId === s.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copié</> : <><Copy className="w-3 h-3" /> Copier</>}
            </button>
          </div>

          {/* Key points */}
          {s.keyPoints?.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-slate-500 font-display tracking-wider mb-1.5">POINTS CLÉS À MENTIONNER</p>
              <div className="flex flex-wrap gap-1.5">
                {s.keyPoints.map((kp, i) => (
                  <span key={i} className="chip chip-accent text-[0.6rem]">{kp}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tone advice */}
          {s.toneAdvice && (
            <div className="p-2.5 rounded-lg bg-amber-500/[0.04] border border-amber-500/10 flex items-start gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400/80">{s.toneAdvice}</p>
            </div>
          )}

          {s.cvUsed && (
            <div className="flex items-center gap-1.5 text-[0.6rem] text-emerald-400/60">
              <FileText className="w-3 h-3" /> Personnalisé avec votre CV
            </div>
          )}
        </div>
      )}
    </div>
  );
}
