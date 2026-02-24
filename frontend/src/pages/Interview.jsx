import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Square, Pause, Play, Clock, Loader2, AlertCircle, Copy, Check, Zap, ChevronDown, FileText, Lightbulb, Globe, Monitor, Video, Settings, X, MonitorUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createSession, updateSession, getMessages, processAudio, getActiveCV } from '../services/api';
import { loadLlmSettings, hasActiveKey, getProviderKey } from '../services/llmSettings';
import { useInterviewStore } from '../store/interviewStore';

const CHUNK_DURATION_MS = 3000;

// TypeWriter component for streaming effect
function TypeWriter({ text, speed = 15 }) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, text, speed]);

  useEffect(() => {
    // Reset when text changes completely (new suggestion)
    if (!text.startsWith(displayText.slice(0, -1))) {
      setDisplayText('');
      setCurrentIndex(0);
    }
  }, [text]);

  return (
    <span>
      {displayText}
      {currentIndex < text.length && (
        <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5" />
      )}
    </span>
  );
}

// Live Transcript Line with streaming effect
function LiveTranscriptLine({ line, isLatest }) {
  return (
    <div className={`rounded-lg border px-3 py-2 transition-all duration-300 ${
      line.isQuestion 
        ? 'border-amber-500/40 bg-amber-500/10 shadow-lg shadow-amber-500/5' 
        : 'border-white/10 bg-white/5'
    } ${isLatest ? 'animate-slideIn' : ''}`}>
      <div className="flex items-center gap-2 text-[0.65rem] text-slate-400 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-[0.6rem] font-medium uppercase ${
          line.speaker === 'interviewer' 
            ? 'bg-purple-500/20 text-purple-300' 
            : 'bg-cyan-500/20 text-cyan-300'
        }`}>
          {line.speaker === 'interviewer' ? 'Interviewer' : 'Vous'}
        </span>
        {line.isQuestion && (
          <span className="text-amber-400 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Question
          </span>
        )}
      </div>
      <p className="text-sm text-slate-200 leading-relaxed">
        {isLatest ? <TypeWriter text={line.text} speed={20} /> : line.text}
      </p>
    </div>
  );
}

// Streaming Suggestion Card
function StreamingSuggestionCard({ suggestion, onCopy, onToggle }) {
  const [copied, setCopied] = useState(false);
  const isStreaming = suggestion.fullText !== suggestion.preview && suggestion.fullText.length < 500;

  const handleCopy = () => {
    onCopy(suggestion.fullText || suggestion.preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent p-4 space-y-3 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center">
            <Lightbulb className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-xs font-medium text-accent">Suggestion IA</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-[0.65rem] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              En cours...
            </span>
          )}
        </div>
        <button 
          className={`text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${
            copied 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copié!' : 'Copier'}
        </button>
      </div>
      
      <div className="text-sm text-slate-200 leading-relaxed">
        {isStreaming ? (
          <TypeWriter text={suggestion.fullText} speed={10} />
        ) : (
          <span>{suggestion.expanded ? suggestion.fullText : suggestion.preview}</span>
        )}
      </div>

      {suggestion.fullText && suggestion.fullText.length > 220 && !isStreaming && (
        <button 
          className="text-xs text-accent/70 hover:text-accent flex items-center gap-1"
          onClick={() => onToggle(suggestion.id)}
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${suggestion.expanded ? 'rotate-180' : ''}`} />
          {suggestion.expanded ? 'Réduire' : 'Voir plus'}
        </button>
      )}
    </div>
  );
}

// PiP (Picture-in-Picture) Meeting View Component
function MeetingViewSection({ pipEnabled, onTogglePip, pipStream, pipError }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && pipStream) {
      videoRef.current.srcObject = pipStream;
    }
  }, [pipStream]);

  return (
    <section className="card flex flex-col overflow-hidden" data-testid="meeting-view">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-slate-400" />
          <div>
            <h2 className="font-display text-sm font-semibold">Meeting View</h2>
            <p className="text-xs text-slate-500">
              {pipEnabled ? 'Capture d\'écran active' : 'Positionnez votre réunion ici'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onTogglePip}
          className={`btn text-xs px-3 py-1.5 ${
            pipEnabled 
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
              : 'btn-outline'
          }`}
          data-testid="pip-toggle-btn"
        >
          {pipEnabled ? (
            <>
              <X className="w-3.5 h-3.5" /> Arrêter PiP
            </>
          ) : (
            <>
              <MonitorUp className="w-3.5 h-3.5" /> Activer PiP
            </>
          )}
        </button>
      </div>
      
      <div className="flex-1 flex items-center justify-center relative bg-black/20">
        {pipEnabled && pipStream ? (
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            className="w-full h-full object-contain"
            data-testid="pip-video"
          />
        ) : (
          <div className="text-center p-8 space-y-4">
            {pipError ? (
              <div className="text-red-400 text-sm flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {pipError}
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
                  <Video className="w-8 h-8 text-slate-600" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-slate-300 font-medium">Mode PiP disponible</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Cliquez sur "Activer PiP" pour capturer l'écran de votre réunion vidéo. 
                    Vous pouvez aussi positionner la fenêtre de votre appli de visio à côté.
                  </p>
                </div>
                <div className="flex justify-center gap-3 pt-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="w-3 h-3 rounded bg-purple-500/50" />
                    <span>Zoom</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="w-3 h-3 rounded bg-blue-500/50" />
                    <span>Meet</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="w-3 h-3 rounded bg-cyan-500/50" />
                    <span>Teams</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Interview() {
  const { sessionId: paramId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('idle');
  const suggestions = useInterviewStore(state => state.suggestions);
  const [sessionId, setSessionId] = useState(paramId || null);
  const [settings, setSettings] = useState(null);
  const [cvActive, setCvActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [questionCount, setQuestionCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [ending, setEnding] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [detectedLang, setDetectedLang] = useState('fr');
  const [lastPipelineMs, setLastPipelineMs] = useState(null);

  // PiP state
  const [pipEnabled, setPipEnabled] = useState(false);
  const [pipStream, setPipStream] = useState(null);
  const [pipError, setPipError] = useState('');
  
  // Speaker tracking
  const [speakerCounts, setSpeakerCounts] = useState({ interviewer: 0, candidate: 0 });

  const timerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const transcriptLines = useInterviewStore(state => state.transcriptLines);
  const coachingTips = useInterviewStore(state => state.coachingTips);
  const totalFillers = useInterviewStore(state => state.totalFillers);
  const getTopFillers = useInterviewStore(state => state.getTopFillers);
  const addTranscriptLine = useInterviewStore(state => state.addTranscriptLine);
  const addSuggestionStart = useInterviewStore(state => state.addSuggestionStart);
  const addSuggestionDelta = useInterviewStore(state => state.addSuggestionDelta);
  const toggleSuggestion = useInterviewStore(state => state.toggleSuggestion);
  const updateFillerCounts = useInterviewStore(state => state.updateFillerCounts);
  const clearSession = useInterviewStore(state => state.clearSession);

  const streamRef = useRef(null);
  const activeRef = useRef(false);
  const transcriptEndRef = useRef(null);
  const suggestionsEndRef = useRef(null);

  const [useStreaming, setUseStreaming] = useState(true);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [streamError, setStreamError] = useState('');
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceNodeRef = useRef(null);

  // Pre-interview checklist state
  const [profileReady, setProfileReady] = useState(false);

  // Auto-scroll to latest content
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptLines]);

  useEffect(() => {
    if (suggestionsEndRef.current) {
      suggestionsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [suggestions]);

  useEffect(() => {
    (async () => {
      try {
        const cv = await getActiveCV();
        const sett = loadLlmSettings();
        setSettings(sett);
        setCvActive(!!cv);
        
        // Check if profile is ready
        try {
          const profileStatus = await fetch(`${import.meta.env.REACT_APP_BACKEND_URL}/api/ingestion/status`);
          const status = await profileStatus.json();
          setProfileReady(status.available);
        } catch { setProfileReady(false); }
        
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

  useEffect(() => {
    if (['recording', 'processing'].includes(status)) {
      timerRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (pipStream) {
        pipStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // PiP handlers
  const handleTogglePip = useCallback(async () => {
    if (pipEnabled) {
      // Stop PiP
      if (pipStream) {
        pipStream.getTracks().forEach(t => t.stop());
      }
      setPipStream(null);
      setPipEnabled(false);
      setPipError('');
    } else {
      // Start PiP
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });
        setPipStream(stream);
        setPipEnabled(true);
        setPipError('');

        // Handle user stopping share
        stream.getVideoTracks()[0].onended = () => {
          setPipStream(null);
          setPipEnabled(false);
        };
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          setPipError('Permission refusée. Autorisez le partage d\'écran.');
        } else {
          setPipError('Impossible d\'activer la capture d\'écran.');
        }
        console.error('PiP error:', err);
      }
    }
  }, [pipEnabled, pipStream]);

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
          const speaker = msg.speaker || 'interviewer';
          if (deltaText) {
            addTranscriptLine({
              speaker,
              text: deltaText,
              isQuestion: deltaText.trim().endsWith('?')
            });
            updateFillerCounts(deltaText);
            
            // Track speaker counts
            setSpeakerCounts(prev => ({
              ...prev,
              [speaker]: (prev[speaker] || 0) + 1
            }));
            
            // Count questions from interviewer
            if (deltaText.trim().endsWith('?') && speaker === 'interviewer') {
              setQuestionCount(prev => prev + 1);
            }
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

  const startRecording = useCallback(async (e) => {
    if (e) e.preventDefault();  // URGENT: Prevent page reload
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
        const result = await processAudio({ session_id: sid, audio_data: b64, mime_type: 'audio/webm' });
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

  const pauseRecording = useCallback((e) => {
    if (e) e.preventDefault();  // URGENT: Prevent page reload
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

  const stopRecording = useCallback(async (e) => {
    if (e) e.preventDefault();  // URGENT: Prevent page reload
    activeRef.current = false;
    if (useStreaming) {
      stopStreaming();
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStatus('idle');
    if (!sessionId) return;
    setEnding(true);
    try {
      await updateSession(sessionId, { status: 'completed', duration_seconds: timer });
      navigate(`/analysis/${sessionId}`);
    } catch {
      setEnding(false);
    }
  }, [sessionId, timer, navigate, useStreaming, stopStreaming]);

  const pauseRecording = useCallback((e) => {
    if (e) e.preventDefault();  // URGENT: Prevent page reload

  const handleCopy = (text) => {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  if (loading) return (
    <div className="h-screen bg-void flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );
  
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
      <header className="h-14 border-b border-white/[0.04] bg-void/80 backdrop-blur-xl flex items-center px-4 gap-3 flex-shrink-0 z-50">
        <Link to="/dashboard" className="btn-ghost p-2" data-testid="interview-back">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-px h-6 bg-white/[0.06]" />
        
        {isActive && (
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-display text-xs text-red-400 tracking-wider">EN DIRECT</span>
          </div>
        )}
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-2">
          {cvActive && (
            <span className="chip chip-success text-[0.65rem]" data-testid="cv-badge">
              <FileText className="w-3 h-3" /> CV actif
            </span>
          )}
          <span className={`chip text-[0.65rem] font-display ${detectedLang === 'fr' ? 'chip-accent' : 'chip-purple'}`} data-testid="lang-badge">
            <Globe className="w-3 h-3" /> {detectedLang.toUpperCase()}
          </span>
          <span className="chip chip-accent text-[0.65rem]" data-testid="question-count">
            <Zap className="w-3 h-3" /> {questionCount} questions
          </span>
          {/* Speaker indicators */}
          {isActive && (speakerCounts.interviewer > 0 || speakerCounts.candidate > 0) && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10" data-testid="speaker-indicators">
              <span className="flex items-center gap-1 text-[0.6rem] text-purple-300">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                {speakerCounts.interviewer}
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                {speakerCounts.candidate}
              </span>
            </div>
          )}
          <span className="chip chip-neutral font-mono text-sm" data-testid="timer-badge">
            <Clock className="w-3.5 h-3.5" /> {fmt(timer)}
          </span>
          {lastPipelineMs && isActive && (
            <span className={`chip text-[0.65rem] font-mono font-semibold ${
              lastPipelineMs < 1500 ? 'chip-success' : lastPipelineMs < 2500 ? 'chip-warn' : 'chip-danger'
            }`} data-testid="latency-badge">
              {(lastPipelineMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </header>

      {/* Main Content - Side by Side */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 p-4">
          {/* Left Panel - Meeting View */}
          <MeetingViewSection 
            pipEnabled={pipEnabled}
            onTogglePip={handleTogglePip}
            pipStream={pipStream}
            pipError={pipError}
          />

          {/* Right Panel - Suggestions */}
          <aside className="card flex flex-col overflow-hidden" data-testid="suggestions-panel">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Lightbulb className="w-3.5 h-3.5 text-accent" />
                </div>
                <h2 className="font-display text-sm font-semibold">Assistant IA</h2>
              </div>
              <span className="text-[0.65rem] text-slate-500">{transcriptLines.length} segments</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Live Transcript */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Transcription</span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[0.65rem] text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                  {/* Speaker legend */}
                  {transcriptLines.length > 0 && (
                    <div className="flex items-center gap-2 text-[0.6rem]">
                      <span className="flex items-center gap-1 text-purple-300">
                        <span className="w-2 h-2 rounded bg-purple-500/30"></span>
                        Interviewer
                      </span>
                      <span className="flex items-center gap-1 text-cyan-300">
                        <span className="w-2 h-2 rounded bg-cyan-500/30"></span>
                        Vous
                      </span>
                    </div>
                  )}
                </div>
                
                {transcriptLines.length ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {transcriptLines.slice(-5).map((line, idx) => (
                      <LiveTranscriptLine 
                        key={line.id} 
                        line={line} 
                        isLatest={idx === transcriptLines.slice(-5).length - 1}
                      />
                    ))}
                    <div ref={transcriptEndRef} />
                  </div>
                ) : status === 'idle' ? (
                  /* Pre-Interview Checklist */
                  <div className="space-y-3" data-testid="pre-interview-checklist">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Checklist</p>
                    <div className="space-y-2">
                      <div className={`flex items-center gap-2 p-2 rounded-lg ${hasKey ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${hasKey ? 'bg-emerald-500/30' : 'bg-amber-500/30'}`}>
                          {hasKey ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertCircle className="w-2.5 h-2.5 text-amber-400" />}
                        </div>
                        <span className={`text-xs ${hasKey ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {hasKey ? 'Cle API configuree' : 'Cle API requise'}
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded-lg ${cvActive ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-500/10 border border-slate-500/20'}`}>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${cvActive ? 'bg-emerald-500/30' : 'bg-slate-500/30'}`}>
                          {cvActive ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <FileText className="w-2.5 h-2.5 text-slate-500" />}
                        </div>
                        <span className={`text-xs ${cvActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {cvActive ? 'CV charge' : 'CV optionnel'}
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded-lg ${profileReady ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-500/10 border border-slate-500/20'}`}>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${profileReady ? 'bg-emerald-500/30' : 'bg-slate-500/30'}`}>
                          {profileReady ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Zap className="w-2.5 h-2.5 text-slate-500" />}
                        </div>
                        <span className={`text-xs ${profileReady ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {profileReady ? 'Profil construit' : 'Profil optionnel'}
                        </span>
                      </div>
                    </div>
                    {!hasKey && (
                      <Link to="/settings" className="btn btn-outline text-xs w-full mt-2">
                        <Settings className="w-3.5 h-3.5" /> Configurer
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500">
                    <Mic className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">En attente de transcription...</p>
                  </div>
                )}
              </div>

              {/* AI Suggestions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Suggestions</span>
                  <span className="text-[0.65rem] text-slate-600">({suggestions.length})</span>
                </div>
                
                {suggestions.length ? (
                  <div className="space-y-3">
                    {suggestions.slice(-3).map(s => (
                      <StreamingSuggestionCard
                        key={s.id}
                        suggestion={s}
                        onCopy={handleCopy}
                        onToggle={toggleSuggestion}
                      />
                    ))}
                    <div ref={suggestionsEndRef} />
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                    <Lightbulb className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-xs text-slate-500">Les suggestions apparaîtront ici</p>
                    <p className="text-[0.65rem] text-slate-600 mt-1">Détection automatique des questions</p>
                  </div>
                )}
              </div>

              {/* Coaching Tips */}
              {(coachingTips.length > 0 || totalFillers > 0) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Coaching</span>
                    {totalFillers > 0 && (
                      <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-medium ${
                        totalFillers > 10 ? 'bg-red-500/20 text-red-400' : 
                        totalFillers > 5 ? 'bg-amber-500/20 text-amber-400' : 
                        'bg-slate-500/20 text-slate-400'
                      }`} data-testid="filler-count">
                        {totalFillers} filler{totalFillers > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  {/* Filler Word Stats */}
                  {(() => {
                    const topFillers = getTopFillers();
                    if (topFillers.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-2" data-testid="filler-stats">
                        {topFillers.map(({ word, count, label }) => (
                          <div 
                            key={word} 
                            className={`px-2 py-1 rounded-lg text-[0.65rem] font-medium border ${
                              count >= 5 ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                              count >= 3 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                              'bg-slate-500/10 border-slate-500/30 text-slate-400'
                            }`}
                          >
                            "{label}" × {count}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  
                  {/* Coaching Tips */}
                  {coachingTips.map(tip => (
                    <div key={tip.id} className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300 flex items-start gap-2 animate-fadeIn">
                      <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {tip.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Controls */}
      <div className="border-t border-white/[0.04] bg-base/90 backdrop-blur-xl flex-shrink-0 z-50" data-testid="controls">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col items-center gap-4">
          {/* Settings Row */}
          <div className="flex flex-wrap items-center gap-3 justify-center text-xs text-slate-500">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={useStreaming} 
                onChange={e => setUseStreaming(e.target.checked)}
                className="accent-accent"
              />
              <span>Mode streaming temps réel</span>
            </label>
            
            {useStreaming && (
              <select 
                className="input text-xs py-1.5 min-w-[180px]" 
                value={selectedDeviceId} 
                onChange={e => setSelectedDeviceId(e.target.value)}
              >
                {devices.length === 0 && <option value="">Microphone par défaut</option>}
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
            
            {useStreaming && wsStatus !== 'disconnected' && (
              <span className={`text-[0.65rem] px-2 py-1 rounded ${
                wsStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 
                wsStatus === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20'
              }`}>
                WS: {wsStatus}
              </span>
            )}
            
            <Link to="/settings" className="btn btn-outline text-xs px-3 py-1.5">
              <Settings className="w-3.5 h-3.5" /> Settings
            </Link>
          </div>

          {/* Error Display */}
          {streamError && (
            <div className="text-xs text-red-400 flex items-center gap-1.5 bg-red-500/10 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" /> {streamError}
            </div>
          )}

          {/* Main Controls */}
          <div className="flex items-center justify-center gap-4">
            {status === 'idle' && !ending && (
              <>
                <button 
                  type="button"
                  className="btn btn-primary text-sm px-8 py-3 shadow-lg shadow-accent/20" 
                  onClick={startRecording} 
                  disabled={!hasKey} 
                  data-testid="start-btn"
                >
                  <Mic className="w-5 h-5" /> Démarrer l'entretien
                </button>
                {!hasKey && (
                  <Link to="/settings">
                    <button type="button" className="btn btn-outline text-sm" data-testid="config-btn">
                      <AlertCircle className="w-4 h-4 text-amber-400" /> Configurer
                    </button>
                  </Link>
                )}
              </>
            )}
            
            {status === 'recording' && (
              <>
                <div className="flex items-center gap-1 h-8 px-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="wave-bar" />
                  ))}
                </div>
                <button 
                  type="button"
                  className="btn btn-outline text-sm px-6 py-2.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10" 
                  onClick={pauseRecording} 
                  data-testid="pause-btn"
                >
                  <Pause className="w-4 h-4" /> Pause
                </button>
                <button 
                  type="button"
                  className="btn btn-danger-outline text-sm px-6 py-2.5" 
                  onClick={stopRecording} 
                  data-testid="stop-btn"
                >
                  <Square className="w-4 h-4" /> Terminer
                </button>
              </>
            )}
            
            {status === 'processing' && (
              <>
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                <span className="text-sm text-slate-400">Analyse en cours...</span>
                <button 
                  type="button"
                  className="btn btn-danger-outline text-sm px-5 py-2" 
                  onClick={stopRecording} 
                  data-testid="stop-proc-btn"
                >
                  <Square className="w-4 h-4" /> Terminer
                </button>
              </>
            )}
            
            {status === 'paused' && (
              <>
                <button 
                  type="button"
                  className="btn btn-success text-sm px-6 py-2.5" 
                  onClick={startRecording} 
                  data-testid="resume-btn"
                >
                  <Play className="w-4 h-4" /> Reprendre
                </button>
                <button 
                  type="button"
                  className="btn btn-danger-outline text-sm px-6 py-2.5" 
                  onClick={stopRecording} 
                  data-testid="stop-paused-btn"
                >
                  <Square className="w-4 h-4" /> Terminer
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
        .wave-bar {
          width: 3px;
          height: 100%;
          background: linear-gradient(to top, var(--accent), var(--accent2));
          animation: wave 1s ease-in-out infinite;
          border-radius: 2px;
        }
        .wave-bar:nth-child(1) { animation-delay: 0s; }
        .wave-bar:nth-child(2) { animation-delay: 0.1s; }
        .wave-bar:nth-child(3) { animation-delay: 0.2s; }
        .wave-bar:nth-child(4) { animation-delay: 0.3s; }
        .wave-bar:nth-child(5) { animation-delay: 0.4s; }
        @keyframes wave {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

// Utility functions
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.readAsDataURL(blob);
  });
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
