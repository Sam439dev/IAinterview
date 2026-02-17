import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Square, Pause, Play, Clock, Loader2, AlertCircle, Copy, Check, Zap, ChevronDown, FileText, Lightbulb, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createSession, updateSession, getMessages, processAudio, getActiveCV } from '../services/api';
import { loadLlmSettings, hasActiveKey, getProviderKey } from '../services/llmSettings';

import { useInterviewStore } from '../store/interviewStore';

const CHUNK_DURATION_MS = 3000; // 3 seconds for ultra-fast detection (target ≤2s latency)

export default function Interview() {
  const { sessionId: paramId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('idle');
  const suggestions = useInterviewStore(state => state.suggestions);
  const [sessionId, setSessionId] = useState(paramId || null);
  const [settings, setSettings] = useState(null);
  const [cvActive, setCvActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [ending, setEnding] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [detectedLang, setDetectedLang] = useState('fr');
  const [lastPipelineMs, setLastPipelineMs] = useState(null);

  const timerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const transcriptLines = useInterviewStore(state => state.transcriptLines);
  const coachingTips = useInterviewStore(state => state.coachingTips);
  const addTranscriptLine = useInterviewStore(state => state.addTranscriptLine);
  const addSuggestionStart = useInterviewStore(state => state.addSuggestionStart);
  const addSuggestionDelta = useInterviewStore(state => state.addSuggestionDelta);
  const toggleSuggestion = useInterviewStore(state => state.toggleSuggestion);
  const updateFillerCounts = useInterviewStore(state => state.updateFillerCounts);
  const clearSession = useInterviewStore(state => state.clearSession);

  const streamRef = useRef(null);
  const activeRef = useRef(false);
  const sugEndRef = useRef(null);

  const [useStreaming, setUseStreaming] = useState(true);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [wsStatus, setWsStatus] = useState('disconnected');
  // stream transcript handled by store
  const [streamError, setStreamError] = useState('');
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceNodeRef = useRef(null);


  useEffect(() => {
    (async () => {
      try {
        const cv = await getActiveCV();
        const sett = loadLlmSettings();
        setSettings(sett);
        setCvActive(!!cv);
        if (paramId) {
          const msgs = await getMessages(paramId);
          if (msgs?.length) {
            const sugs = [];
            msgs.forEach(m => {
              if (m.role === 'assistant') {
                sugs.push({
                  id: m.id, response: m.content, category: m.category || 'general',
                  keyPoints: m.key_points || [], toneAdvice: m.tone_advice,
                  questionSummary: m.question_summary, confidence: m.confidence || 0,
                  time: new Date(m.created_at), ms: m.response_ms
                });
              }
            });
            clearSession();
            sugs.forEach(s => {
              addSuggestionStart(s.id);
              addSuggestionDelta(s.id, s.response || '');
            });
            setQuestionCount(sugs.length);
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [paramId]);


  useEffect(() => {
    const loadDevices = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = list.filter(d => d.kind === 'audioinput');
        setDevices(audioInputs);
        if (!selectedDeviceId && audioInputs.length) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (e) {
        console.warn('Unable to enumerate devices', e);
      }
    };
    loadDevices();
  }, [selectedDeviceId]);

  useEffect(() => { sugEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [suggestions]);

  useEffect(() => {
    if (['recording', 'processing'].includes(status)) {
      timerRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    return () => { activeRef.current = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const hasKey = hasActiveKey(settings || undefined);
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const providerKey = getProviderKey(settings || {});
  const getWsUrl = () => {
    const base = import.meta.env.REACT_APP_BACKEND_URL || '';
    const wsBase = base.replace(/^http/, 'ws');
    return `${wsBase.replace(/\/$/, '')}/api/ws/stream`;
  };

  const stopStreaming = useCallback(() => {
    activeRef.current = false;
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    wsRef.current?.close();
    wsRef.current = null;

    processorRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    processorRef.current = null;
    sourceNodeRef.current = null;
    audioContextRef.current = null;

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    setWsStatus('disconnected');
    setStatus('idle');
  }, []);

  const startStreaming = useCallback(async () => {
    if (status === 'recording') return;
    if (!hasKey || !providerKey) {
      alert('Veuillez configurer votre clé API avant de démarrer le streaming.');
      return;
    }
    setStreamError('');
    clearSession();

    let sid = sessionId;
    if (!sid) {
      const s = await createSession({ title: `Session ${new Date().toLocaleString()}` });
      sid = s.id;
      setSessionId(sid);
    }

    activeRef.current = true;
    const constraints = {
      audio: {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNodeRef.current = sourceNode;
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;


    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      ws.send(JSON.stringify({
        type: 'start',
        session_id: sid,
        llm_provider: settings?.provider || 'openai',
        llm_model: settings?.model || 'gpt-4o',
        llm_api_key: providerKey,
        sample_rate: 16000
      }));
      setStatus('recording');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'transcript') {
          const deltaText = msg.delta || msg.text || '';
          if (deltaText) {
            addTranscriptLine({
              speaker: msg.speaker || 'interviewer',
              text: deltaText,
              isQuestion: deltaText.trim().endsWith('?')
            });
            updateFillerCounts(deltaText);
          }
        }
        if (msg.type === 'suggestion_start') {
          addSuggestionStart(msg.id);
        }
        if (msg.type === 'suggestion_delta') {
          addSuggestionDelta(msg.id, msg.text || '');
        }
      } catch (e) {
        console.warn('WS message error', e);
      }
    };

    ws.onerror = () => {
      setStreamError('Connexion WebSocket échouée.');
      setWsStatus('error');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
    };

    processor.onaudioprocess = (event) => {
      if (!activeRef.current || ws.readyState !== 1) return;
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(input, audioContext.sampleRate, 16000);
      if (!downsampled.length) return;
      const int16 = floatTo16BitPCM(downsampled);
      const base64 = arrayBufferToBase64(int16.buffer);
      ws.send(JSON.stringify({ type: 'audio_chunk', audio: base64, sample_rate: 16000 }));
    };

    sourceNode.connect(processor);
    processor.connect(audioContext.destination);
  }, [status, hasKey, providerKey, sessionId, selectedDeviceId, settings, getWsUrl, clearSession, addTranscriptLine, addSuggestionStart, addSuggestionDelta, updateFillerCounts]);

  const startRecording = useCallback(async () => {
    if (useStreaming) {
      await startStreaming();
      return;
    }
    if (!hasKey) return;
    activeRef.current = true;
    let sid = sessionId;
    if (!sid) {
      try {
        const s = await createSession({ title: `Session ${new Date().toLocaleDateString('fr-FR')}` });
        sid = s.id;
        setSessionId(sid);
        navigate(`/interview/${sid}`, { replace: true });
      } catch { return; }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      setStatus('recording');
      recordLoop(stream, sid);
    } catch (e) {
      console.error('Mic error:', e);
      alert("Impossible d'accéder au micro. Vérifiez les permissions.");
    }
  }, [hasKey, sessionId, useStreaming, startStreaming]);

  const recordLoop = useCallback((stream, sid) => {
    if (!stream?.active || !activeRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType });
    recorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      if (!chunksRef.current.length || !activeRef.current) return;
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      if (blob.size < 500) { if (activeRef.current && stream.active) recordLoop(stream, sid); return; }

      setStatus('processing');
      setChunkCount(p => p + 1);
      try {
        const b64 = await blobToBase64(blob);
        const result = await processAudio({ session_id: sid, audio_data: b64, mime_type: 'audio/webm' });  // No language - auto-detect
        setLastError(null);
        if (result.detected_language) setDetectedLang(result.detected_language);
        if (result.pipeline_ms) setLastPipelineMs(result.pipeline_ms);
        if (result.error) { setLastError(result.error); }
        else if (result.detected && result.suggested_response) {
          setQuestionCount(p => p + 1);
          const sidSuggestion = `s-${Date.now()}`;
          addSuggestionStart(sidSuggestion);
          addSuggestionDelta(sidSuggestion, result.suggested_response);
        }
      } catch (e) {
        const msg = e.response?.data?.detail || 'Erreur';
        setLastError(msg);
      }
      if (activeRef.current && stream.active) { setStatus('recording'); recordLoop(stream, sid); }
    };
    rec.start();
    setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, CHUNK_DURATION_MS);
  }, [detectedLang, addSuggestionStart, addSuggestionDelta]);

  const pauseRecording = useCallback(() => {
    if (useStreaming) {
      stopStreaming();
      setStatus('paused');
      return;
    }
    activeRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStatus('paused');
  }, [useStreaming, stopStreaming]);

  const stopRecording = useCallback(async () => {
    activeRef.current = false;
    if (useStreaming) {
      stopStreaming();
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStatus('idle');
    if (!sessionId) return;

  const handleCopy = (text) => {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

    setEnding(true);
    try {
      await updateSession(sessionId, { status: 'completed', duration_seconds: timer });
      navigate(`/session/${sessionId}/summary`);
    } catch { setEnding(false); }
  }, [sessionId, timer, navigate, useStreaming, stopStreaming]);



  if (loading) return <div className="h-screen bg-void flex items-center justify-center"><Loader2 className="w-6 h-6 text-accent animate-spin" /></div>;
  if (ending) return (
    <div className="h-screen bg-void flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 text-accent animate-spin" />
      <p className="text-sm text-slate-400 font-display">Génération du résumé...</p>
      <p className="text-xs text-slate-600">Transcription complète + analyse des échanges</p>
    </div>
  );

  const isActive = ['recording', 'processing'].includes(status);

  return (
    <div className="h-screen bg-void flex flex-col" data-testid="interview-page">
      {/* Top bar */}
      <header className="h-12 border-b border-white/[0.04] bg-void/80 backdrop-blur-xl flex items-center px-4 gap-2.5 flex-shrink-0 z-50">
        <Link to="/dashboard" className="btn-ghost p-1.5" data-testid="interview-back"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="w-px h-5 bg-white/[0.06]" />
        {isActive && <div className="w-2 h-2 rounded-full bg-red-500 pulse-dot" />}
        <span className="font-display text-xs text-slate-500 tracking-wider hidden sm:block">{isActive ? 'EN DIRECT' : 'SESSION'}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {cvActive && <span className="chip chip-success text-[0.6rem]" data-testid="cv-badge"><FileText className="w-3 h-3" /> CV</span>}
          <span className={`chip text-[0.6rem] font-display ${detectedLang === 'fr' ? 'chip-accent' : 'chip-purple'}`} data-testid="lang-badge">
            <Globe className="w-3 h-3" /> {detectedLang === 'fr' ? 'FR' : detectedLang === 'en' ? 'EN' : detectedLang.toUpperCase()}
          </span>
          <span className="chip chip-accent text-[0.6rem]" data-testid="question-count">
          {useStreaming && streamTranscript && (
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1">Transcript en direct</div>
              <p className="text-sm text-slate-200 leading-relaxed">{streamTranscript}</p>
            </div>
          )}

            <Zap className="w-3 h-3" /> {questionCount}
          </span>
          <span className="chip chip-neutral font-mono" data-testid="timer-badge">
            <Clock className="w-3 h-3" /> {fmt(timer)}
          </span>
          {lastPipelineMs && isActive && (
            <span className={`chip text-[0.6rem] font-mono font-semibold ${lastPipelineMs < 1500 ? 'chip-success' : lastPipelineMs < 2500 ? 'chip-warn' : 'chip-danger'}`} data-testid="latency-badge">
              ⚡ {(lastPipelineMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </header>

      {/* Main: Suggestions */}
      <div className="flex-1 overflow-y-auto" data-testid="suggestions-panel">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Idle empty */}
          {suggestions.length === 0 && status === 'idle' && (
            <div className="flex flex-col items-center justify-center py-20" data-testid="empty-state">
              <div className="w-20 h-20 rounded-2xl bg-accent/[0.05] border border-accent/10 flex items-center justify-center mb-6 glow-accent">
                <Mic className="w-10 h-10 text-accent/60" />
              </div>
              <h2 className="font-display font-semibold text-xl mb-2">Prêt à enregistrer</h2>
              <p className="text-sm text-slate-500 text-center max-w-md mb-1">
                L'IA écoute en continu et détecte les questions du recruteur pour vous suggérer des réponses personnalisées.
              </p>
              <p className="text-xs text-slate-600 text-center">Détection automatique FR / EN. Transcription à la fin de la session.</p>
            </div>
          )}

          {/* Recording/processing empty */}
          {suggestions.length === 0 && isActive && (
            <div className="flex flex-col items-center justify-center py-16" data-testid="listening-state">
              <div className="flex items-center gap-1 h-16 mb-4">
                {[...Array(7)].map((_, i) => <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.08}s`, width: '4px' }} />)}
              </div>
              <p className="text-sm text-accent font-display mb-1">Écoute en cours...</p>
              <p className="text-xs text-slate-500">
                {chunkCount > 0 ? `${chunkCount} segment${chunkCount > 1 ? 's' : ''} analysé${chunkCount > 1 ? 's' : ''}` : 'En attente de question'}
              </p>
              {lastError && (
                <div className="mt-3 p-2.5 rounded-lg bg-red-500/[0.06] border border-red-500/15 max-w-md" data-testid="error-msg">
                  <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {lastError}</p>
                </div>
              )}
            </div>
          )}

          {/* Suggestions */}
          {suggestions.map((s, i) => (
            <SuggestionCard key={s.id} s={s} i={i} onCopy={copyText} copiedId={copiedId} catMap={catMap} />
          ))}

          {/* Inline processing */}
          {status === 'processing' && suggestions.length > 0 && (
            <div className="flex items-center justify-center gap-2.5 p-3 card animate-pulse" data-testid="processing-indicator">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span className="text-xs text-amber-400 font-display">Analyse...</span>
            </div>
          )}

          {lastError && suggestions.length > 0 && (
            <div className="p-2.5 rounded-lg bg-red-500/[0.06] border border-red-500/15">
              <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {lastError}</p>
            </div>
          )}

          <div ref={sugEndRef} />
        </div>
      </div>

      {/* Controls */}
      <div className="border-t border-white/[0.04] bg-base/90 backdrop-blur-xl flex-shrink-0 z-50" data-testid="controls">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center gap-3 justify-center text-xs text-slate-500">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={useStreaming} onChange={e => setUseStreaming(e.target.checked)} />
              Mode streaming WebSocket
            </label>
            {useStreaming && (
              <select className="input text-xs py-1.5" value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)}>
                {devices.length === 0 && <option value="">Microphone par défaut</option>}
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                ))}
              </select>
            )}
            {useStreaming && wsStatus !== 'disconnected' && (
              <span className="text-[0.65rem] text-slate-400">WS: {wsStatus}</span>
            )}
          </div>
          {streamError && (
            <div className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> {streamError}
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            {status === 'idle' && !ending && (
              <>
                <button className="btn btn-primary text-sm px-10 py-3.5" onClick={startRecording} disabled={!hasKey} data-testid="start-btn">
                  <Mic className="w-5 h-5" /> Démarrer l'enregistrement
                </button>
                {!hasKey && <Link to="/settings"><button className="btn btn-outline text-xs" data-testid="config-btn"><AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Configurer</button></Link>}
              </>
            )}
            {status === 'recording' && (
              <>
                <div className="flex items-center gap-[3px] h-7 px-2">{[...Array(5)].map((_, i) => <div key={i} className="wave-bar" />)}</div>
                <button className="btn btn-outline text-sm px-5 py-2.5 border-amber-500/20 text-amber-400 hover:bg-amber-500/5" onClick={pauseRecording} data-testid="pause-btn">
                  <Pause className="w-4 h-4" /> Pause
                </button>
                <button className="btn btn-danger-outline text-sm px-5 py-2.5" onClick={stopRecording} data-testid="stop-btn">
                  <Square className="w-4 h-4" /> Arrêter et résumer
                </button>
              </>
            )}
            {status === 'processing' && (
              <>
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                <button className="btn btn-danger-outline text-sm px-5 py-2.5" onClick={stopRecording} data-testid="stop-proc-btn">
                  <Square className="w-4 h-4" /> Arrêter et résumer
                </button>
              </>
            )}
            {status === 'paused' && (
              <>
                <button className="btn btn-success text-sm px-5 py-2.5" onClick={startRecording} data-testid="resume-btn"><Play className="w-4 h-4" /> Reprendre</button>
                <button className="btn btn-danger-outline text-sm px-5 py-2.5" onClick={stopRecording} data-testid="stop-paused-btn"><Square className="w-4 h-4" /> Arrêter et résumer</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({ s, i, onCopy, copiedId, catMap }) {
  const [open, setOpen] = useState(true);
  const cat = catMap[s.category] || catMap.general;
  const langLabel = s.responseLang === 'en' ? 'EN' : 'FR';
  const isGoodLatency = s.ms && s.ms < 1500;
  const isOkLatency = s.ms && s.ms >= 1500 && s.ms < 2500;
  
  return (
    <div className="card fade-up overflow-hidden" data-testid={`suggestion-${i}`}>
      <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-2 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <Zap className="w-3.5 h-3.5 text-accent2" />
        {cat.label && <span className={`chip text-[0.6rem] ${cat.cls}`}>{cat.label}</span>}
        <span className={`chip text-[0.55rem] ${s.responseLang === 'en' ? 'chip-purple' : 'chip-accent'}`}>{langLabel}</span>
        {s.confidence > 0 && <span className="chip chip-neutral text-[0.6rem]">{Math.round(s.confidence * 100)}%</span>}
        <div className="flex-1" />
        {s.ms && (
          <span className={`text-[0.6rem] font-mono font-semibold ${isGoodLatency ? 'text-emerald-400' : isOkLatency ? 'text-amber-400' : 'text-red-400'}`}>
            ⚡ {(s.ms / 1000).toFixed(1)}s
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`} />
      </div>
      {open && (
        <div className="p-4 space-y-3">
          {s.questionSummary && (
            <div className="p-2.5 rounded-lg bg-accent/[0.04] border border-accent/10">
              <p className="text-[0.6rem] text-accent/70 font-display tracking-wider mb-1">QUESTION DÉTECTÉE</p>
              <p className="text-sm text-slate-300">{s.questionSummary}</p>
            </div>
          )}
          <div className="relative group">
            <div className="p-3 rounded-lg bg-accent2/[0.03] border border-accent2/[0.08]">
              <p className="text-[0.6rem] text-accent2/70 font-display tracking-wider mb-1.5">SUGGESTION</p>
              <div className="ai-md text-sm text-slate-300 leading-relaxed"><ReactMarkdown>{s.response}</ReactMarkdown></div>
            </div>
            <button className="absolute top-2 right-2 btn btn-outline text-[0.6rem] py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopy(s.response, s.id)} data-testid={`copy-${i}`}>
              {copiedId === s.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copié</> : <><Copy className="w-3 h-3" /> Copier</>}
            </button>
          </div>
          {s.keyPoints?.length > 0 && (
            <div>
              <p className="text-[0.6rem] text-slate-500 font-display tracking-wider mb-1">POINTS CLÉS</p>
              <div className="flex flex-wrap gap-1">{s.keyPoints.map((k, j) => <span key={j} className="chip chip-accent text-[0.55rem]">{k}</span>)}</div>
            </div>
          )}
          {s.toneAdvice && (
            <div className="p-2 rounded-lg bg-amber-500/[0.04] border border-amber-500/10 flex items-start gap-2">
              <Lightbulb className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400/80">{s.toneAdvice}</p>
            </div>
          )}
          {s.cvUsed && <p className="text-[0.55rem] text-emerald-400/60 flex items-center gap-1"><FileText className="w-3 h-3" /> Personnalisé avec CV</p>}
        </div>
      )}
    </div>
  );
}

function blobToBase64(blob) {
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(blob); });
}


function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate === inputSampleRate) return buffer;
  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      sum += buffer[i];
      count += 1;
    }
    result[offsetResult] = sum / count;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPCM(floatBuffer) {
  const output = new Int16Array(floatBuffer.length);
  for (let i = 0; i < floatBuffer.length; i += 1) {
    const s = Math.max(-1, Math.min(1, floatBuffer[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
