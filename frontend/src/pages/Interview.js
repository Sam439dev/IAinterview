import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Brain, Mic, MicOff, Square, Play, Pause, ChevronLeft, Loader2, MessageSquare, Clock, AlertCircle, Zap, Globe, BarChart3, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getSettings, getSessions, createSession, updateSession, getSessionMessages, processAudio } from '../services/api';
import Navbar from '../components/Navbar';

export default function Interview() {
  const { sessionId: paramSessionId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('idle'); // idle | listening | analyzing | responding | paused | error
  const [messages, setMessages] = useState([]);
  const [detectedLanguage, setDetectedLanguage] = useState('fr');
  const [sessionTime, setSessionTime] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState(paramSessionId || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      try {
        const sett = await getSettings();
        setSettings(sett);
        if (paramSessionId) {
          const msgs = await getSessionMessages(paramSessionId);
          if (msgs && msgs.length > 0) {
            setMessages(msgs.map(m => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.created_at),
              latencyMs: m.response_latency_ms || m.transcription_latency_ms || null,
              isQuestion: m.role === 'user'
            })));
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [paramSessionId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Timer
  useEffect(() => {
    if (['listening', 'analyzing', 'responding'].includes(status)) {
      timerRef.current = setInterval(() => setSessionTime(p => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const hasApiKey = settings?.has_key;
  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const startRecording = useCallback(async () => {
    if (!hasApiKey) return;

    let sid = currentSessionId;
    if (!sid) {
      try {
        const session = await createSession({ title: `Session du ${new Date().toLocaleDateString('fr-FR')}` });
        sid = session.id;
        setCurrentSessionId(sid);
        setSessionData(session);
      } catch (e) {
        setStatus('error');
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];

        if (blob.size < 1000) return; // Too small

        setIsProcessing(true);
        setStatus('analyzing');

        try {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result.split(',')[1];
            try {
              const result = await processAudio({
                session_id: sid,
                audio_data: base64,
                mime_type: 'audio/webm',
                language: detectedLanguage
              });

              if (result.transcript) {
                setMessages(prev => [...prev, {
                  id: `user-${Date.now()}`,
                  role: 'user',
                  content: result.transcript,
                  timestamp: new Date(),
                  latencyMs: result.transcription_latency_ms,
                  isQuestion: result.is_question
                }]);

                if (result.detected_language) setDetectedLanguage(result.detected_language);

                if (result.is_question && result.ai_response) {
                  setStatus('responding');
                  setMessages(prev => [...prev, {
                    id: `ai-${Date.now()}`,
                    role: 'assistant',
                    content: result.ai_response,
                    timestamp: new Date(),
                    latencyMs: result.response_latency_ms
                  }]);
                }
              }
            } catch (err) {
              console.error('Process error:', err);
            } finally {
              setIsProcessing(false);
              setStatus('listening');
              // Auto-restart recording
              if (mediaRecorderRef.current && streamRef.current?.active) {
                audioChunksRef.current = [];
                try {
                  mediaRecorderRef.current.start();
                  setTimeout(() => {
                    if (mediaRecorderRef.current?.state === 'recording') {
                      mediaRecorderRef.current.stop();
                    }
                  }, 8000);
                } catch (e) { /* recorder may be inactive */ }
              }
            }
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          setIsProcessing(false);
          setStatus('listening');
        }
      };

      recorder.start();
      setStatus('listening');

      // Auto-stop after 8 seconds to send chunk
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 8000);

    } catch (e) {
      console.error('Mic error:', e);
      setStatus('error');
    }
  }, [hasApiKey, currentSessionId, detectedLanguage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setStatus('idle');

    if (currentSessionId) {
      updateSession(currentSessionId, { status: 'completed', duration_seconds: sessionTime }).catch(() => {});
    }
  }, [currentSessionId, sessionTime]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setStatus('paused');
  }, []);

  const statusConfig = {
    idle: { label: 'EN ATTENTE', color: 'text-slate-500', bg: 'bg-slate-800/50' },
    listening: { label: 'ÉCOUTE', color: 'text-cyber-cyan', bg: 'bg-cyber-cyan/10' },
    analyzing: { label: 'ANALYSE', color: 'text-cyber-orange', bg: 'bg-cyber-orange/10' },
    responding: { label: 'RÉPONSE', color: 'text-cyber-green', bg: 'bg-cyber-green/10' },
    paused: { label: 'PAUSE', color: 'text-cyber-orange', bg: 'bg-cyber-orange/10' },
    error: { label: 'ERREUR', color: 'text-cyber-magenta', bg: 'bg-cyber-magenta/10' }
  };

  if (loading) {
    return (
      <div className="h-screen bg-void cyber-grid flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyber-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-void cyber-grid flex flex-col" data-testid="interview-page">
      {/* Top Bar */}
      <nav className="border-b border-slate-800/50 bg-void/80 backdrop-blur-md flex-shrink-0">
        <div className="max-w-full flex items-center justify-between h-12 px-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="btn-ghost p-1.5" data-testid="interview-back-btn">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <Brain className="w-4 h-4 text-cyber-cyan" />
            <span className="font-heading text-sm tracking-wider text-slate-400 hidden sm:block">
              {sessionData?.title || (paramSessionId ? 'SESSION' : 'NOUVELLE SESSION')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 border border-slate-800 bg-paper" data-testid="language-indicator">
              <Globe className="w-3 h-3 text-slate-500" />
              <span className="font-mono text-xs">{detectedLanguage === 'fr' ? 'FR' : 'EN'}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 border border-slate-800 bg-paper" data-testid="timer-display">
              <Clock className="w-3 h-3 text-slate-500" />
              <span className="font-mono text-xs">{formatTime(sessionTime)}</span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 ${statusConfig[status].bg}`} data-testid="status-indicator">
              {status === 'listening' && <div className="w-2 h-2 rounded-full bg-cyber-cyan pulse-recording" />}
              {status === 'analyzing' && <Loader2 className="w-3 h-3 text-cyber-orange animate-spin" />}
              {status === 'responding' && <Zap className="w-3 h-3 text-cyber-green animate-pulse" />}
              {['idle', 'paused', 'error'].includes(status) && <div className={`w-2 h-2 rounded-full ${status === 'error' ? 'bg-cyber-magenta' : status === 'paused' ? 'bg-cyber-orange' : 'bg-slate-600'}`} />}
              <span className={`text-xs font-heading tracking-wider ${statusConfig[status].color}`}>{statusConfig[status].label}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Conversation Panel */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 pb-32" data-testid="messages-container">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 && status === 'idle' && (
                <div className="text-center py-16 fade-in-up" data-testid="empty-state">
                  <div className="w-20 h-20 border border-cyber-cyan/30 bg-cyber-cyan/5 flex items-center justify-center mx-auto mb-6 glow-cyan">
                    <Mic className="w-10 h-10 text-cyber-cyan" />
                  </div>
                  <h2 className="font-heading font-bold text-2xl mb-3 text-cyber-cyan text-glow-cyan">PRÊT À COMMENCER</h2>
                  <p className="text-slate-400 max-w-md mx-auto mb-6">
                    Cliquez sur le bouton microphone pour démarrer l'enregistrement.
                    L'assistant analysera vos questions en temps réel.
                  </p>
                  {!hasApiKey && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 border border-cyber-orange/30 bg-cyber-orange/5 text-cyber-orange text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>Configurez votre clé API dans les paramètres</span>
                    </div>
                  )}
                </div>
              )}

              {messages.map((msg, idx) => (
                <MessageBubble key={msg.id || idx} message={msg} />
              ))}

              {isProcessing && (
                <div className="flex items-center gap-3 p-4 border border-cyber-orange/20 bg-cyber-orange/5 fade-in-up" data-testid="processing-indicator">
                  <Loader2 className="w-5 h-5 text-cyber-orange animate-spin" />
                  <div>
                    <p className="text-sm font-heading text-cyber-orange tracking-wider">
                      {status === 'analyzing' ? 'ANALYSE EN COURS...' : 'GÉNÉRATION DE RÉPONSE...'}
                    </p>
                    <p className="text-xs text-slate-500">Traitement par l'IA</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Controls */}
          <div className="sticky bottom-0 left-0 right-0 p-4 border-t border-slate-800/50 bg-void/95 backdrop-blur-md z-20" data-testid="controls-panel">
            <div className="max-w-3xl mx-auto flex items-center justify-center gap-4">
              {status === 'idle' ? (
                <button
                  className="btn-primary text-lg px-8 py-4 flex items-center gap-3"
                  onClick={startRecording}
                  disabled={!hasApiKey}
                  data-testid="start-recording-btn"
                >
                  <Mic className="w-6 h-6" />
                  DÉMARRER
                </button>
              ) : status === 'paused' ? (
                <>
                  <button className="btn-primary px-6 py-4 flex items-center gap-2 bg-cyber-green border-cyber-green" onClick={startRecording} data-testid="resume-btn">
                    <Play className="w-5 h-5" /> REPRENDRE
                  </button>
                  <button className="btn-danger px-6 py-4 flex items-center gap-2" onClick={stopRecording} data-testid="stop-btn">
                    <Square className="w-5 h-5" /> TERMINER
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary px-6 py-4 flex items-center gap-2 border-cyber-orange text-cyber-orange hover:bg-cyber-orange/10" onClick={pauseRecording} disabled={isProcessing} data-testid="pause-btn">
                    <Pause className="w-5 h-5" /> PAUSE
                  </button>
                  <button className="btn-danger px-6 py-4 flex items-center gap-2" onClick={stopRecording} disabled={isProcessing} data-testid="stop-recording-btn">
                    <Square className="w-5 h-5" /> ARRÊTER
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Side Panel - Stats (desktop) */}
        <div className="hidden lg:block w-72 border-l border-slate-800/50 bg-paper/50 p-4 overflow-auto" data-testid="stats-panel">
          <h3 className="font-heading text-xs tracking-widest mb-4 text-slate-500">STATISTIQUES SESSION</h3>
          <div className="space-y-4">
            <StatBox icon={MessageSquare} label="Questions détectées" value={messages.filter(m => m.isQuestion).length} color="cyan" />
            <StatBox icon={Zap} label="Réponses générées" value={messages.filter(m => m.role === 'assistant').length} color="purple" />
            <StatBox icon={Clock} label="Latence moyenne" value={
              messages.filter(m => m.latencyMs).length > 0
                ? `${Math.round(messages.filter(m => m.latencyMs).reduce((a, m) => a + m.latencyMs, 0) / messages.filter(m => m.latencyMs).length)}ms`
                : '—'
            } color="green" />
            <StatBox icon={Globe} label="Langue détectée" value={detectedLanguage === 'fr' ? 'Français' : 'English'} color="orange" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }) {
  return (
    <div className="p-3 bg-void border border-slate-800/50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className={`w-4 h-4 text-cyber-${color}`} />
      </div>
      <p className={`text-xl font-heading font-bold text-cyber-${color}`}>{value}</p>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} fade-in-up`} data-testid={`message-${message.id}`}>
      <div className={`max-w-[85%]`}>
        <div className={`p-4 ${
          isUser
            ? 'bg-cyber-cyan/5 border border-cyber-cyan/20'
            : 'bg-cyber-green/5 border border-cyber-green/20'
        }`}>
          {message.isQuestion && isUser && (
            <span className="text-xs font-heading text-cyber-cyan tracking-wider px-2 py-0.5 bg-cyber-cyan/10 border border-cyber-cyan/20 mb-2 inline-block">
              QUESTION DÉTECTÉE
            </span>
          )}
          {isUser ? (
            <p className="text-sm leading-relaxed text-slate-200">{message.content}</p>
          ) : (
            <div className="ai-response text-sm text-slate-200">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-2 mt-1 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-slate-600 font-mono">
            {message.timestamp?.toLocaleTimeString?.('fr-FR', { hour: '2-digit', minute: '2-digit' }) || ''}
          </span>
          {message.latencyMs && (
            <span className={`text-xs font-mono ${message.latencyMs < 2000 ? 'text-cyber-green' : message.latencyMs < 5000 ? 'text-cyber-orange' : 'text-cyber-magenta'}`}>
              {message.latencyMs}ms
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
