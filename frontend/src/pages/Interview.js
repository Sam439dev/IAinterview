import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Square, Pause, Play, Clock, Loader2, AlertCircle, Copy, Check, Zap, ChevronDown, FileText, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getSettings, createSession, updateSession, getMessages, processAudio, getActiveCV } from '../services/api';

export default function Interview() {
  const { sessionId: paramId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('idle'); // idle | recording | processing | paused
  const [suggestions, setSuggestions] = useState([]);
  const [sessionId, setSessionId] = useState(paramId || null);
  const [settings, setSettings] = useState(null);
  const [cvActive, setCvActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [ending, setEnding] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);

  const timerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const autoRecordRef = useRef(true);
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
            let qCount = 0;
            const sugs = [];
            msgs.forEach(m => {
              if (m.role === 'assistant') {
                qCount++;
                sugs.push({
                  id: m.id, response: m.content, category: m.category || 'general',
                  keyPoints: m.key_points || [], toneAdvice: m.tone_advice,
                  questionSummary: m.question_summary, confidence: m.confidence || 0,
                  time: new Date(m.created_at), ms: m.response_ms
                });
              }
            });
            setSuggestions(sugs);
            setQuestionCount(qCount);
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [paramId]);

  // Auto-scroll suggestions
  useEffect(() => { suggestionsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [suggestions]);

  // Timer
  useEffect(() => {
    if (['recording', 'processing'].includes(status)) {
      timerRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    } else if (status === 'paused') {
      clearInterval(timerRef.current);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  // Cleanup
  useEffect(() => {
    return () => {
      autoRecordRef.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const hasKey = settings?.has_key;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Start audio recording
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
      } catch { return; }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;
      setStatus('recording');
      recordChunk(stream, sid);
    } catch (e) {
      console.error('Mic access error:', e);
      alert("Impossible d'accéder au microphone. Vérifiez les permissions du navigateur.");
    }
  }, [hasKey, sessionId, navigate]);

  // Record a chunk, send it, then record the next one
  const recordChunk = useCallback((stream, sid) => {
    if (!stream?.active || !autoRecordRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = async () => {
      if (chunksRef.current.length === 0 || !autoRecordRef.current) return;
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];

      if (blob.size < 1000) {
        if (autoRecordRef.current && stream.active) recordChunk(stream, sid);
        return;
      }

      setStatus('processing');
      setChunkCount(prev => prev + 1);

      try {
        const base64 = await blobToBase64(blob);
        const result = await processAudio({
          session_id: sid,
          audio_data: base64,
          mime_type: 'audio/webm',
          language: 'fr'
        });

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
            cvUsed: result.cv_active
          }]);
        }
      } catch (e) { console.error('Process error:', e); }

      // Continue recording next chunk
      if (autoRecordRef.current && stream.active) {
        setStatus('recording');
        recordChunk(stream, sid);
      }
    };

    recorder.start();
    // Auto-stop after 8 seconds to send the chunk
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, 8000);
  }, []);

  // Pause
  const pauseRecording = useCallback(() => {
    autoRecordRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStatus('paused');
  }, []);

  // Stop and go to summary
  const stopRecording = useCallback(async () => {
    autoRecordRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStatus('idle');

    if (!sessionId) return;
    setEnding(true);
    try {
      await updateSession(sessionId, { status: 'completed', duration_seconds: timer });
      navigate(`/session/${sessionId}/summary`);
    } catch (e) {
      console.error(e);
      setEnding(false);
    }
  }, [sessionId, timer, navigate]);

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

  if (ending) return (
    <div className="h-screen bg-void flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 text-accent animate-spin" />
      <p className="text-sm text-slate-400 font-display">Préparation du résumé...</p>
      <p className="text-xs text-slate-600">Transcription complète + analyse des échanges</p>
    </div>
  );

  return (
    <div className="h-screen bg-void flex flex-col" data-testid="interview-page">
      {/* Top bar */}
      <header className="h-12 border-b border-white/[0.04] bg-void/80 backdrop-blur-xl flex items-center px-4 gap-3 flex-shrink-0 z-50">
        <Link to="/dashboard" className="btn-ghost p-1.5" data-testid="interview-back"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="w-px h-5 bg-white/[0.06]" />
        <span className="font-display text-xs text-slate-500 tracking-wider hidden sm:block">SESSION</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {cvActive && <span className="chip chip-success text-[0.6rem]" data-testid="cv-badge"><FileText className="w-3 h-3" /> CV actif</span>}
          <span className="chip chip-accent text-[0.6rem]" data-testid="question-count">
            <Zap className="w-3 h-3" /> {questionCount} suggestion{questionCount !== 1 ? 's' : ''}
          </span>
          <span className="chip chip-neutral font-mono" data-testid="timer-badge">
            <Clock className="w-3 h-3" /> {fmt(timer)}
          </span>
          <StatusChip status={status} />
        </div>
      </header>

      {/* Main content: Suggestions panel */}
      <div className="flex-1 overflow-y-auto" data-testid="suggestions-panel">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Empty state */}
          {suggestions.length === 0 && status === 'idle' && (
            <div className="flex flex-col items-center justify-center py-20" data-testid="empty-state">
              <div className="w-20 h-20 rounded-2xl bg-accent/[0.05] border border-accent/10 flex items-center justify-center mb-6 glow-accent">
                <Mic className="w-10 h-10 text-accent/60" />
              </div>
              <h2 className="font-display font-semibold text-xl mb-2 text-slate-200">Prêt à enregistrer</h2>
              <p className="text-sm text-slate-500 text-center max-w-md mb-2">
                Démarrez l'enregistrement. L'IA écoute en continu et détecte les questions du recruteur pour vous suggérer des réponses.
              </p>
              <p className="text-xs text-slate-600 text-center max-w-sm">
                La transcription complète sera disponible à la fin de la session.
              </p>
            </div>
          )}

          {suggestions.length === 0 && ['recording', 'processing'].includes(status) && (
            <div className="flex flex-col items-center justify-center py-16" data-testid="listening-state">
              <WaveformLarge />
              <p className="text-sm text-accent font-display mt-6 mb-1">Écoute en cours...</p>
              <p className="text-xs text-slate-500">
                {chunkCount > 0 ? `${chunkCount} segments analysés` : 'En attente de détection de question'}
              </p>
            </div>
          )}

          {/* Suggestion cards */}
          {suggestions.map((s, i) => (
            <SuggestionCard key={s.id} suggestion={s} index={i} onCopy={copyText} copiedId={copiedId} categoryLabels={categoryLabels} />
          ))}

          {/* Processing indicator */}
          {status === 'processing' && suggestions.length > 0 && (
            <div className="flex items-center justify-center gap-3 p-4 card" data-testid="processing-indicator">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span className="text-xs text-amber-400 font-display">Analyse d'un segment audio...</span>
            </div>
          )}

          <div ref={suggestionsEndRef} />
        </div>
      </div>

      {/* Controls bar */}
      <div className="border-t border-white/[0.04] bg-base/90 backdrop-blur-xl flex-shrink-0 z-50" data-testid="controls">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-center gap-3">
          {status === 'idle' && !ending && (
            <>
              <button className="btn btn-primary text-sm px-10 py-3.5" onClick={startRecording} disabled={!hasKey} data-testid="start-btn">
                <Mic className="w-5 h-5" /> Démarrer l'enregistrement
              </button>
              {!hasKey && (
                <Link to="/settings"><button className="btn btn-outline text-xs" data-testid="config-btn"><AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Configurer</button></Link>
              )}
            </>
          )}

          {status === 'recording' && (
            <>
              <div className="flex items-center gap-[3px] h-8 px-3">
                {[...Array(5)].map((_, i) => <div key={i} className="wave-bar" />)}
              </div>
              <button className="btn btn-outline text-sm px-6 py-3 border-amber-500/20 text-amber-400 hover:bg-amber-500/5" onClick={pauseRecording} data-testid="pause-btn">
                <Pause className="w-4 h-4" /> Pause
              </button>
              <button className="btn btn-danger-outline text-sm px-6 py-3" onClick={stopRecording} data-testid="stop-btn">
                <Square className="w-4 h-4" /> Arrêter et résumer
              </button>
            </>
          )}

          {status === 'processing' && (
            <>
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              <span className="text-xs text-amber-400 font-display">Analyse...</span>
              <button className="btn btn-danger-outline text-sm px-6 py-3" onClick={stopRecording} data-testid="stop-processing-btn">
                <Square className="w-4 h-4" /> Arrêter et résumer
              </button>
            </>
          )}

          {status === 'paused' && (
            <>
              <button className="btn btn-success text-sm px-6 py-3" onClick={startRecording} data-testid="resume-btn">
                <Play className="w-4 h-4" /> Reprendre
              </button>
              <button className="btn btn-danger-outline text-sm px-6 py-3" onClick={stopRecording} data-testid="stop-paused-btn">
                <Square className="w-4 h-4" /> Arrêter et résumer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    idle: { label: 'En attente', cls: 'chip-neutral' },
    recording: { label: 'Enregistrement', cls: 'chip-accent', dot: true },
    processing: { label: 'Analyse', cls: 'chip-warn' },
    paused: { label: 'Pause', cls: 'chip-warn' },
  };
  const c = map[status] || map.idle;
  return (
    <span className={`chip ${c.cls}`} data-testid="status-chip">
      {c.dot && <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" />}
      {status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
      {c.label}
    </span>
  );
}

function WaveformLarge() {
  return (
    <div className="flex items-center gap-1 h-16">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.08}s`, width: '4px' }} />
      ))}
    </div>
  );
}

function SuggestionCard({ suggestion: s, index, onCopy, copiedId, categoryLabels }) {
  const [expanded, setExpanded] = useState(true);
  const cat = categoryLabels[s.category] || categoryLabels.general;

  return (
    <div className="card fade-up overflow-hidden" data-testid={`suggestion-${index}`}>
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
          {s.questionSummary && (
            <div className="p-3 rounded-lg bg-accent/[0.04] border border-accent/10">
              <p className="text-[0.65rem] text-accent/70 font-display tracking-wider mb-1">QUESTION / INTENTION DÉTECTÉE</p>
              <p className="text-sm text-slate-300">{s.questionSummary}</p>
            </div>
          )}

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

          {s.keyPoints?.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-slate-500 font-display tracking-wider mb-1.5">POINTS CLÉS</p>
              <div className="flex flex-wrap gap-1.5">
                {s.keyPoints.map((kp, i) => <span key={i} className="chip chip-accent text-[0.6rem]">{kp}</span>)}
              </div>
            </div>
          )}

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

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
