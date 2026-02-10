import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Square, Pause, Play, Clock, Globe, Loader2, AlertCircle, Copy, Check, Zap, ChevronDown, MessageSquare, FileText, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getSettings, createSession, updateSession, getMessages, processAudio, getActiveCV } from '../services/api';

export default function Interview() {
  const { sessionId: paramId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('idle'); // idle | listening | processing | paused | error
  const [transcript, setTranscript] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [lang, setLang] = useState('fr');
  const [timer, setTimer] = useState(0);
  const [sessionId, setSessionId] = useState(paramId || null);
  const [settings, setSettings] = useState(null);
  const [cvActive, setCvActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [showPanel, setShowPanel] = useState('suggestions'); // suggestions | transcript (mobile)

  const timerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const autoRecordRef = useRef(true);
  const transcriptEndRef = useRef(null);
  const suggestionsEndRef = useRef(null);

  // Load initial
  useEffect(() => {
    (async () => {
      try {
        const [sett, cv] = await Promise.all([getSettings(), getActiveCV()]);
        setSettings(sett);
        setCvActive(!!cv);
        if (paramId) {
          const msgs = await getMessages(paramId);
          if (msgs?.length) {
            const t = [], s = [];
            msgs.forEach(m => {
              if (m.role === 'user') t.push({ id: m.id, text: m.content, time: new Date(m.created_at), ms: m.transcription_ms });
              else s.push({
                id: m.id, response: m.content, category: m.category || 'general',
                keyPoints: m.key_points || [], toneAdvice: m.tone_advice,
                questionSummary: m.question_summary, confidence: m.confidence || 0,
                time: new Date(m.created_at), ms: m.response_ms
              });
            });
            setTranscript(t);
            setSuggestions(s);
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [paramId]);

  // Auto-scroll
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);
  useEffect(() => { suggestionsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [suggestions]);

  // Timer
  useEffect(() => {
    if (['listening', 'processing'].includes(status)) {
      timerRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      autoRecordRef.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const hasKey = settings?.has_key;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const startRecording = useCallback(async () => {
    if (!hasKey) return;
    autoRecordRef.current = true;
    let sid = sessionId;
    if (!sid) {
      try {
        const s = await createSession({ title: `Session du ${new Date().toLocaleDateString('fr-FR')}` });
        sid = s.id;
        setSessionId(sid);
        navigate(`/interview/${sid}`, { replace: true });
      } catch { setStatus('error'); return; }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;
      recordChunk(stream, sid);
    } catch (e) {
      console.error('Mic error:', e);
      setStatus('error');
    }
  }, [hasKey, sessionId, navigate]);

  const recordChunk = useCallback((stream, sid) => {
    if (!stream?.active || !autoRecordRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      if (chunksRef.current.length === 0) return;
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      if (blob.size < 1000) {
        if (autoRecordRef.current && stream.active) recordChunk(stream, sid);
        return;
      }

      setStatus('processing');
      try {
        const base64 = await blobToBase64(blob);
        const result = await processAudio({ session_id: sid, audio_data: base64, mime_type: 'audio/webm', language: lang });

        if (result.transcript) {
          setTranscript(prev => [...prev, { id: `t-${Date.now()}`, text: result.transcript, time: new Date(), ms: result.transcription_ms }]);
          if (result.detected_language) setLang(result.detected_language);

          if (result.detected && result.suggested_response) {
            setSuggestions(prev => [...prev, {
              id: `s-${Date.now()}`, response: result.suggested_response,
              category: result.category || 'general', keyPoints: result.key_points || [],
              toneAdvice: result.tone_advice, questionSummary: result.question_summary,
              confidence: result.confidence || 0, time: new Date(), ms: result.response_ms,
              cvUsed: result.cv_active
            }]);
          }
        }
      } catch (e) { console.error('Process error:', e); }

      if (autoRecordRef.current && stream.active) {
        setStatus('listening');
        recordChunk(stream, sid);
      }
    };

    recorder.start();
    setStatus('listening');
    setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 7000);
  }, [lang]);

  const stopAll = useCallback(() => {
    autoRecordRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStatus('idle');
    if (sessionId) updateSession(sessionId, { status: 'completed', duration_seconds: timer }).catch(() => {});
  }, [sessionId, timer]);

  const pauseAll = useCallback(() => {
    autoRecordRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStatus('paused');
  }, []);

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
          {sessionId ? 'SESSION EN COURS' : 'NOUVELLE SESSION'}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {cvActive && <span className="chip chip-success text-[0.6rem]" data-testid="cv-badge"><FileText className="w-3 h-3" /> CV actif</span>}
          <div className="chip chip-neutral" data-testid="lang-badge">
            <Globe className="w-3 h-3" /> {lang === 'fr' ? 'FR' : 'EN'}
          </div>
          <div className="chip chip-neutral font-mono" data-testid="timer-badge">
            <Clock className="w-3 h-3" /> {fmt(timer)}
          </div>
          <StatusBadge status={status} />
        </div>
      </header>

      {/* Mobile toggle */}
      <div className="lg:hidden flex border-b border-white/[0.04]">
        <button className={`flex-1 py-2.5 text-xs font-display tracking-wider ${showPanel === 'transcript' ? 'text-accent border-b-2 border-accent' : 'text-slate-500'}`}
          onClick={() => setShowPanel('transcript')} data-testid="mobile-transcript-tab">
          Transcription
        </button>
        <button className={`flex-1 py-2.5 text-xs font-display tracking-wider ${showPanel === 'suggestions' ? 'text-accent border-b-2 border-accent' : 'text-slate-500'}`}
          onClick={() => setShowPanel('suggestions')} data-testid="mobile-suggestions-tab">
          Suggestions {suggestions.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-accent/20 text-accent rounded-full text-[0.6rem]">{suggestions.length}</span>}
        </button>
      </div>

      {/* Main split view */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT: Transcript */}
        <div className={`flex-1 flex flex-col border-r border-white/[0.04] ${showPanel !== 'transcript' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
            <Mic className="w-3.5 h-3.5 text-accent" />
            <h2 className="font-display text-xs tracking-wider text-slate-500">TRANSCRIPTION EN DIRECT</h2>
            <div className="flex-1" />
            <span className="text-[0.65rem] text-slate-600 font-mono">{transcript.length} segments</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="transcript-panel">
            {transcript.length === 0 && status === 'idle' && (
              <div className="flex-1 flex items-center justify-center h-full" data-testid="transcript-empty">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                    <Mic className="w-8 h-8 text-slate-700" />
                  </div>
                  <p className="text-sm text-slate-400 mb-1">En attente d'enregistrement</p>
                  <p className="text-xs text-slate-600">Les paroles du recruteur apparaîtront ici</p>
                </div>
              </div>
            )}
            {transcript.map((t, i) => (
              <div key={t.id} className="fade-up" data-testid={`transcript-${i}`}>
                <div className="card-inner p-3.5 relative group">
                  <p className="text-sm text-slate-200 leading-relaxed pr-8">{t.text}</p>
                  <button className="absolute top-2.5 right-2.5 btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyText(t.text, t.id)} data-testid={`copy-transcript-${i}`}>
                    {copiedId === t.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <div className="flex items-center gap-2 mt-2 text-[0.65rem] text-slate-600">
                    <span className="font-mono">{t.time?.toLocaleTimeString?.('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    {t.ms && <span className="font-mono text-accent/60">{t.ms}ms</span>}
                  </div>
                </div>
              </div>
            ))}
            {status === 'processing' && (
              <div className="flex items-center gap-2.5 p-3 card-inner border-amber-500/10" data-testid="processing-indicator">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-xs text-amber-400 font-display">Analyse en cours...</span>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* RIGHT: AI Suggestions */}
        <div className={`flex-1 flex flex-col ${showPanel !== 'suggestions' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-accent2" />
            <h2 className="font-display text-xs tracking-wider text-slate-500">SUGGESTIONS IA</h2>
            <div className="flex-1" />
            <span className="text-[0.65rem] text-slate-600 font-mono">{suggestions.length} suggestions</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="suggestions-panel">
            {suggestions.length === 0 && (
              <div className="flex-1 flex items-center justify-center h-full" data-testid="suggestions-empty">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent2/[0.04] border border-accent2/10 flex items-center justify-center mx-auto mb-4">
                    <Lightbulb className="w-8 h-8 text-accent2/30" />
                  </div>
                  <p className="text-sm text-slate-400 mb-1">En attente de questions</p>
                  <p className="text-xs text-slate-600">Les suggestions basées sur votre CV apparaîtront ici</p>
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

      {/* Controls bar */}
      <div className="h-20 border-t border-white/[0.04] bg-base/90 backdrop-blur-xl flex items-center justify-center gap-3 px-4 flex-shrink-0 z-50" data-testid="controls">
        {status === 'idle' ? (
          <button className="btn btn-primary text-sm px-10 py-3.5" onClick={startRecording} disabled={!hasKey} data-testid="start-btn">
            <Mic className="w-5 h-5" /> Démarrer l'écoute
          </button>
        ) : status === 'paused' ? (
          <>
            <button className="btn btn-success text-sm px-6 py-3" onClick={startRecording} data-testid="resume-btn">
              <Play className="w-4 h-4" /> Reprendre
            </button>
            <button className="btn btn-danger-outline text-sm px-6 py-3" onClick={stopAll} data-testid="stop-btn">
              <Square className="w-4 h-4" /> Terminer
            </button>
          </>
        ) : (
          <>
            {status === 'listening' && <WaveformIndicator />}
            {status === 'processing' && <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />}
            <button className="btn btn-outline text-sm px-6 py-3 border-amber-500/20 text-amber-400 hover:bg-amber-500/5" onClick={pauseAll} disabled={status === 'processing'} data-testid="pause-btn">
              <Pause className="w-4 h-4" /> Pause
            </button>
            <button className="btn btn-danger-outline text-sm px-6 py-3" onClick={stopAll} disabled={status === 'processing'} data-testid="stop-all-btn">
              <Square className="w-4 h-4" /> Arrêter
            </button>
          </>
        )}
        {!hasKey && status === 'idle' && (
          <Link to="/settings"><button className="btn btn-outline text-xs" data-testid="go-settings-btn"><AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Configurer la clé API</button></Link>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    idle: { label: 'En attente', cls: 'chip-neutral' },
    listening: { label: 'Écoute', cls: 'chip-accent' },
    processing: { label: 'Analyse', cls: 'chip-warn' },
    paused: { label: 'Pause', cls: 'chip-warn' },
    error: { label: 'Erreur', cls: 'chip-danger' },
  };
  const c = map[status] || map.idle;
  return (
    <span className={`chip ${c.cls}`} data-testid="status-badge">
      {status === 'listening' && <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" />}
      {status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
      {c.label}
    </span>
  );
}

function WaveformIndicator() {
  return (
    <div className="flex items-center gap-[3px] h-8 px-2" data-testid="waveform">
      {[...Array(5)].map((_, i) => <div key={i} className="wave-bar" />)}
    </div>
  );
}

function SuggestionCard({ suggestion: s, index, onCopy, copiedId, categoryLabels }) {
  const [expanded, setExpanded] = useState(true);
  const cat = categoryLabels[s.category] || categoryLabels.general;

  return (
    <div className="card fade-up overflow-hidden" data-testid={`suggestion-${index}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <Zap className="w-3.5 h-3.5 text-accent2" />
        {cat.label && <span className={`chip text-[0.6rem] ${cat.cls}`}>{cat.label}</span>}
        {s.confidence > 0 && <span className="chip chip-neutral text-[0.6rem]">{Math.round(s.confidence * 100)}%</span>}
        <div className="flex-1" />
        {s.ms && <span className="text-[0.6rem] text-slate-600 font-mono">{s.ms}ms</span>}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Question summary */}
          {s.questionSummary && (
            <div className="p-3 rounded-lg bg-accent/[0.04] border border-accent/10">
              <p className="text-[0.65rem] text-accent/70 font-display tracking-wider mb-1">QUESTION DÉTECTÉE</p>
              <p className="text-sm text-slate-300">{s.questionSummary}</p>
            </div>
          )}

          {/* AI Response */}
          <div className="relative group">
            <div className="ai-md text-sm text-slate-300 leading-relaxed">
              <ReactMarkdown>{s.response}</ReactMarkdown>
            </div>
            <button className="absolute top-0 right-0 btn btn-outline text-[0.65rem] py-1 px-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopy(s.response, s.id)} data-testid={`copy-suggestion-${index}`}>
              {copiedId === s.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copié</> : <><Copy className="w-3 h-3" /> Copier</>}
            </button>
          </div>

          {/* Key points */}
          {s.keyPoints?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[0.65rem] text-slate-500 font-display tracking-wider">POINTS CLÉS</p>
              <div className="flex flex-wrap gap-1.5">
                {s.keyPoints.map((kp, i) => (
                  <span key={i} className="chip chip-accent text-[0.6rem]">{kp}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tone advice */}
          {s.toneAdvice && (
            <div className="p-2.5 rounded-lg bg-accent2/[0.04] border border-accent2/10 flex items-start gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-accent2 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-accent2/80">{s.toneAdvice}</p>
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

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
