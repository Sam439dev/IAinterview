import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Key, FileText, Upload, Check, Eye, EyeOff, Trash2, Loader2, AlertCircle, CheckCircle2, Briefcase, GraduationCap, Code2, Star, RefreshCw, X } from 'lucide-react';
import { getActiveCV, uploadCV, deleteCV, reparseCV, buildProfile, getIngestionStatus, clearProfileCache } from '../services/api';
import { loadLlmSettings, saveLlmSettings } from '../services/llmSettings';
import Navbar from '../components/Navbar';

// Confirmation Modal Component
function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel = "Confirmer", danger = false }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-base border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" data-testid="confirm-modal">
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="font-display font-semibold text-lg mb-2">{title}</h3>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        <div className="flex items-center gap-3 justify-end">
          <button 
            onClick={onCancel}
            className="btn btn-outline text-sm px-4 py-2"
            data-testid="modal-cancel-btn"
          >
            Annuler
          </button>
          <button 
            onClick={onConfirm}
            className={`btn text-sm px-4 py-2 ${danger ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' : 'btn-primary'}`}
            data-testid="modal-confirm-btn"
          >
            <Trash2 className="w-4 h-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="min-h-screen bg-void">
      <Navbar title="Paramètres" showBack backTo="/dashboard" />
      <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ApiKeySection />
          <CVSection />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProfileBuilderSection />
          <CacheSection />
        </div>
      </main>
    </div>
  );
}

function ApiKeySection() {
  const [showKey, setShowKey] = useState(false);
  const [showStt, setShowStt] = useState(false);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4o');
  const [keys, setKeys] = useState({ openai: '', anthropic: '', gemini: '', deepseek: '' });
  const [sttKey, setSttKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearTarget, setClearTarget] = useState(null); // 'provider' or 'stt'

  const providerLabels = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    deepseek: 'DeepSeek'
  };

  const modelOptions = {
    openai: [
      { id: 'gpt-4o', label: 'GPT-4o (équilibré)' },
      { id: 'o3-mini', label: 'o3-mini (raisonnement léger)' }
    ],
    anthropic: [
      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
    ],
    gemini: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
    ],
    deepseek: [
      { id: 'deepseek-chat', label: 'DeepSeek V3 (chat)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 (reasoner)' }
    ]
  };

  useEffect(() => {
    const stored = loadLlmSettings();
    setProvider(stored.provider || 'openai');
    setModel(stored.model || 'gpt-4o');
    setKeys({ openai: '', anthropic: '', gemini: '', deepseek: '', ...(stored.keys || {}) });
    setSttKey(stored.sttOpenAIKey || '');
  }, []);

  useEffect(() => {
    setSaved(false);
  }, [provider, model, keys, sttKey]);

  useEffect(() => {
    const options = modelOptions[provider] || [];
    if (options.length && !options.some(option => option.id === model)) {
      setModel(options[0].id);
    }
  }, [provider]);

  const hasKey = !!keys[provider];
  const hasSttKey = !!sttKey;

  const handleSave = () => {
    saveLlmSettings({ provider, model, keys, sttOpenAIKey: sttKey });
    setSaved(true);
  };

  const handleClearClick = (target) => {
    setClearTarget(target);
    setShowClearModal(true);
  };

  const handleConfirmClear = () => {
    if (clearTarget === 'provider') {
      setKeys(prev => ({ ...prev, [provider]: '' }));
    } else if (clearTarget === 'stt') {
      setSttKey('');
    }
    setShowClearModal(false);
    setClearTarget(null);
  };

  const handleKeyChange = (value) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="card" data-testid="api-key-section">
      <ConfirmModal
        isOpen={showClearModal}
        title="Effacer la clé API"
        message={clearTarget === 'stt' 
          ? "Êtes-vous sûr de vouloir effacer la clé Whisper (transcription) ? Cette action est irréversible."
          : `Êtes-vous sûr de vouloir effacer la clé ${providerLabels[provider]} ? Cette action est irréversible.`
        }
        onConfirm={handleConfirmClear}
        onCancel={() => setShowClearModal(false)}
        confirmLabel="Effacer"
        danger={true}
      />
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
          <Key className="w-4 h-4 text-accent" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-sm">Clés LLM (BYOK)</h2>
          <p className="text-xs text-slate-500">Stockées localement, jamais sur nos serveurs</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div className={`flex items-center gap-2.5 p-3 rounded-lg ${hasKey ? 'bg-emerald-500/[0.06] border border-emerald-500/15' : 'bg-amber-500/[0.06] border border-amber-500/15'}`} data-testid="key-status">
          {hasKey ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400 font-medium">Clé {providerLabels[provider]} configurée</span>
              <span className="text-xs text-slate-500 ml-auto font-mono">{keys[provider]?.slice(0, 4)}...{keys[provider]?.slice(-4)}</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-400 font-medium">Clé {providerLabels[provider]} requise</span>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-display">Fournisseur</label>
          <select value={provider} onChange={e => setProvider(e.target.value)} className="input" data-testid="provider-select">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-display">Clé API {providerLabels[provider]}</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={keys[provider] || ''}
              onChange={e => handleKeyChange(e.target.value)}
              placeholder="sk-..."
              className="input pr-20"
              data-testid="api-key-input"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              <button className="btn-ghost p-1.5" onClick={() => setShowKey(!showKey)} title={showKey ? "Masquer" : "Afficher"}>
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {hasKey && (
                <button 
                  className="btn-ghost p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10" 
                  onClick={() => handleClearClick('provider')}
                  title="Effacer cette clé"
                  data-testid="clear-provider-key-btn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-1.5">
            Vous pouvez saisir n'importe quel modèle supporté par votre fournisseur.
          </p>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-display">Modèle LLM</label>
          <input
            list="model-options"
            value={model}
            onChange={e => setModel(e.target.value)}
            className="input"
            data-testid="model-select"
          />
          <datalist id="model-options">
            {(modelOptions[provider] || []).map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-display">Clé OpenAI Whisper (transcription)</label>
          <div className="relative">
            <input
              type={showStt ? 'text' : 'password'}
              value={sttKey}
              onChange={e => setSttKey(e.target.value)}
              placeholder="sk-..."
              className="input pr-20"
              data-testid="stt-key-input"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              <button className="btn-ghost p-1.5" onClick={() => setShowStt(!showStt)} title={showStt ? "Masquer" : "Afficher"}>
                {showStt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {hasSttKey && (
                <button 
                  className="btn-ghost p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10" 
                  onClick={() => handleClearClick('stt')}
                  title="Effacer cette clé"
                  data-testid="clear-stt-key-btn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-1.5">
            Requis si votre fournisseur LLM n'est pas OpenAI (en attendant la transcription locale).
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-white/[0.04]">
          <button className="btn btn-primary text-sm flex-1" onClick={handleSave} data-testid="save-btn">
            <Check className="w-4 h-4" /> Sauvegarder
          </button>
          {saved && <span className="text-sm text-emerald-400 font-medium">Sauvegardé ✓</span>}
        </div>
      </div>
    </div>
  );
}

function CVSection() {
  const ref = useRef(null);
  const [cv, setCv] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => { try { setCv(await getActiveCV()); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const handleUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['application/pdf', 'text/plain'].includes(f.type)) { alert('Format: PDF ou TXT uniquement'); return; }
    if (f.size > 5 * 1024 * 1024) { alert('Max 5MB'); return; }
    setUploading(true);
    try { await uploadCV(f); await load(); } catch { alert("Erreur d'upload. Vérifiez que votre clé API est configurée."); }
    finally { setUploading(false); }
  };

  const handleReparse = async () => {
    setReparsing(true);
    try {
      const updated = await reparseCV();
      setCv(updated);
    } catch (e) {
      const detail = e.response?.data?.detail || '';
      if (detail.includes('401') || detail.includes('Incorrect API key')) {
        alert("Clé API invalide. Mettez à jour votre clé fournisseur dans la section ci-dessus, puis re-parsez le CV.");
      } else {
        alert("Erreur de re-parsing: " + (detail || "Vérifiez votre clé API."));
      }
    }
    finally { setReparsing(false); }
  };

  const handleDel = async () => {
    if (!cv?.id || !window.confirm('Supprimer ce CV ?')) return;
    try { await deleteCV(cv.id); setCv(null); } catch {}
  };

  const hasParsedData = cv?.parsed_data && (
    cv.parsed_data.skills_hard?.length > 0 || 
    cv.parsed_data.skills_soft?.length > 0 ||
    cv.parsed_data.skills?.length > 0 || 
    cv.parsed_data.full_name || 
    cv.parsed_data.experiences?.length > 0
  );

  return (
    <div className="card" data-testid="cv-section">
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <FileText className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-sm">Mon CV</h2>
          <p className="text-xs text-slate-500">Personnalise les réponses de l'IA</p>
        </div>
      </div>
      <div className="p-5">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-accent animate-spin" /></div> : cv ? (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center gap-3 p-3.5 card-inner">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="cv-filename">{cv.file_name}</p>
                <p className="text-[0.65rem] text-slate-500">Uploadé le {new Date(cv.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
              <button className="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10" onClick={handleDel} data-testid="del-cv-btn">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Warning if CV not properly parsed */}
            {!hasParsedData && (
              <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 flex items-start gap-2.5" data-testid="cv-parse-warning">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-amber-400 font-medium mb-1">CV non analysé</p>
                  <p className="text-[0.65rem] text-slate-500 mb-2">L'extraction structurée n'a pas fonctionné. Re-parsez le CV pour activer la personnalisation des réponses.</p>
                  <button className="btn btn-outline text-[0.65rem] py-1.5 px-3 border-amber-500/20 text-amber-400 hover:bg-amber-500/5"
                    onClick={handleReparse} disabled={reparsing} data-testid="reparse-cv-btn">
                    {reparsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Re-parser le CV
                  </button>
                </div>
              </div>
            )}

            {/* Parsed data display */}
            {cv.parsed_data && (
              <div className="space-y-3">
                {cv.parsed_data.full_name && (
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-accent" />
                    <span className="text-sm font-medium text-accent">{cv.parsed_data.full_name}</span>
                    {cv.parsed_data.current_role && <span className="text-xs text-slate-500">- {cv.parsed_data.current_role}</span>}
                  </div>
                )}

                {(cv.parsed_data.skills_hard?.length > 0 || cv.parsed_data.skills?.length > 0) && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider flex items-center gap-1"><Code2 className="w-3 h-3" /> COMPÉTENCES TECHNIQUES</p>
                    <div className="flex flex-wrap gap-1">
                      {(cv.parsed_data.skills_hard || cv.parsed_data.skills || []).map((s, i) => <span key={i} className="chip chip-accent text-[0.6rem]">{s}</span>)}
                    </div>
                  </div>
                )}

                {cv.parsed_data.skills_soft?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider">SOFT SKILLS</p>
                    <div className="flex flex-wrap gap-1">
                      {cv.parsed_data.skills_soft.map((s, i) => <span key={i} className="chip chip-purple text-[0.6rem]">{s}</span>)}
                    </div>
                  </div>
                )}

                {cv.parsed_data.technologies?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider">TECHNOLOGIES</p>
                    <div className="flex flex-wrap gap-1">{cv.parsed_data.technologies.map((t, i) => <span key={i} className="chip chip-warn text-[0.6rem]">{t}</span>)}</div>
                  </div>
                )}

                {cv.parsed_data.methodologies?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider">MÉTHODOLOGIES</p>
                    <div className="flex flex-wrap gap-1">{cv.parsed_data.methodologies.map((m, i) => <span key={i} className="chip chip-neutral text-[0.6rem]">{m}</span>)}</div>
                  </div>
                )}

                {cv.parsed_data.experiences?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider flex items-center gap-1"><Briefcase className="w-3 h-3" /> EXPÉRIENCES ({cv.parsed_data.experiences.length})</p>
                    <div className="space-y-1.5">
                      {cv.parsed_data.experiences.map((e, i) => (
                        <div key={i} className="card-inner p-2.5">
                          <p className="text-xs font-medium">{e.title} <span className="text-slate-500">@ {e.company}</span></p>
                          {e.duration && <p className="text-[0.65rem] text-slate-600">{e.duration}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {cv.parsed_data.education?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider flex items-center gap-1"><GraduationCap className="w-3 h-3" /> FORMATION</p>
                    {cv.parsed_data.education.slice(0, 2).map((e, i) => (
                      <p key={i} className="text-xs text-slate-400">{e.degree} - {e.institution}</p>
                    ))}
                  </div>
                )}

                {cv.parsed_data.strengths?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider">POINTS FORTS</p>
                    <div className="flex flex-wrap gap-1">{cv.parsed_data.strengths.map((s, i) => <span key={i} className="chip chip-success text-[0.6rem]">{s}</span>)}</div>
                  </div>
                )}
              </div>
            )}

            <div className="text-center pt-2">
              <input ref={ref} type="file" accept=".pdf,.txt" onChange={handleUpload} className="hidden" />
              <button className="btn btn-outline text-xs" onClick={() => ref.current?.click()} disabled={uploading} data-testid="replace-cv-btn">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Remplacer
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-slate-700" />
            </div>
            <p className="text-sm text-slate-400 mb-1 font-medium">Aucun CV uploadé</p>
            <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">
              Uploadez votre CV pour que l'IA personnalise ses suggestions avec votre parcours et compétences.
            </p>
            <input ref={ref} type="file" accept=".pdf,.txt" onChange={handleUpload} className="hidden" />
            <button className="btn btn-primary text-xs" onClick={() => ref.current?.click()} disabled={uploading} data-testid="upload-cv-btn">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Uploader mon CV
            </button>
            <p className="text-[0.65rem] text-slate-600 mt-2">PDF ou TXT, max 5MB</p>
          </div>
        )}
      </div>
    </div>
  );
}



function ProfileBuilderSection() {
  // Persist form data in localStorage
  const PROFILE_STORAGE_KEY = 'profileBuilderData';
  
  const loadSavedData = () => {
    try {
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { companyName: '', jobDescription: '', targetRole: '' };
  };
  
  const [companyName, setCompanyName] = useState(() => loadSavedData().companyName);
  const [jobDescription, setJobDescription] = useState(() => loadSavedData().jobDescription);
  const [targetRole, setTargetRole] = useState(() => loadSavedData().targetRole);
  const [building, setBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [existingProfile, setExistingProfile] = useState(null);

  // Load existing profile status on mount
  useEffect(() => {
    getIngestionStatus()
      .then(status => {
        if (status.available) {
          setExistingProfile(status);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-save form data
  useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
      companyName, jobDescription, targetRole
    }));
  }, [companyName, jobDescription, targetRole]);

  const handleBuild = async (e) => {
    e.preventDefault(); // Prevent form submission
    
    if (!companyName.trim() && !jobDescription.trim()) {
      setError("Veuillez renseigner au moins le nom de l'entreprise ou la description du poste.");
      return;
    }
    
    // Check if API key is configured
    const settings = loadLlmSettings();
    const hasKey = settings.keys?.[settings.provider];
    if (!hasKey) {
      setError("Veuillez d'abord configurer votre cle API LLM dans la section ci-dessus.");
      return;
    }
    
    setBuilding(true);
    setError('');
    setResult(null);
    
    try {
      setBuildStep("Recherche d'informations sur l'entreprise...");
      await new Promise(r => setTimeout(r, 500));
      
      setBuildStep('Analyse de la description de poste...');
      const res = await buildProfile({
        company_name: companyName.trim() || 'Non specifie',
        job_description: jobDescription.trim() || 'Non specifie',
        target_role: targetRole.trim() || 'Non specifie'
      });
      
      setBuildStep("Creation de l'index vectoriel...");
      await new Promise(r => setTimeout(r, 300));
      
      setResult(res);
      setExistingProfile({ available: true, doc_count: res.doc_count });
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Erreur lors de la construction du profil.';
      setError(msg);
      console.error('Profile build error:', e);
    } finally {
      setBuilding(false);
      setBuildStep('');
    }
  };

  const handleClearProfile = async () => {
    try {
      await clearProfileCache();
      setResult(null);
      setExistingProfile(null);
    } catch (e) {
      setError('Erreur lors de la suppression du profil.');
    }
  };

  const companySummary = result?.company_summary?.summary || (typeof result?.company_summary === 'string' ? result.company_summary : '');
  const jdSummary = result?.jd_analysis?.summary || '';
  const jdRequirements = result?.jd_analysis?.requirements || [];
  const jdKeywords = result?.jd_analysis?.keywords || [];
  const potentialQuestions = result?.jd_analysis?.potential_questions || [];

  return (
    <div className="card" data-testid="profile-builder-section">
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Star className="w-4 h-4 text-purple-300" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-sm">Profil d'entretien</h2>
            <p className="text-xs text-slate-500">CV + JD + Entreprise = Suggestions personnalisees</p>
          </div>
        </div>
        {existingProfile?.available && (
          <span className="chip chip-success text-[0.65rem]" data-testid="profile-status">
            <CheckCircle2 className="w-3 h-3" /> {existingProfile.doc_count} docs
          </span>
        )}
      </div>
      
      <form onSubmit={handleBuild} className="p-5 space-y-4">
        {/* Status bar */}
        {existingProfile?.available && !result && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400 font-medium">Profil actif</span>
              <span className="text-xs text-slate-500">{existingProfile.doc_count} documents</span>
            </div>
            <button 
              type="button"
              onClick={handleClearProfile}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
              data-testid="clear-profile-btn"
            >
              <Trash2 className="w-3 h-3" /> Effacer
            </button>
          </div>
        )}
        
        <div className="grid gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-display">
              Entreprise cible <span className="text-slate-600">(recherche automatique)</span>
            </label>
            <input 
              className="input" 
              value={companyName} 
              onChange={e => setCompanyName(e.target.value)} 
              placeholder="ex: Stripe, Google, BNP Paribas..."
              data-testid="company-input"
            />
          </div>
          
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-display">
              Role cible <span className="text-slate-600">(optionnel)</span>
            </label>
            <input
              className="input"
              value={targetRole}
              onChange={e => setTargetRole(e.target.value)}
              placeholder="ex: Staff Software Engineer, Product Manager..."
              data-testid="role-input"
            />
          </div>
          
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-display">
              Description du poste (JD)
            </label>
            <textarea
              className="input min-h-[160px] resize-y"
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Collez ici la description complete du poste..."
              data-testid="jd-input"
            />
            <p className="text-[0.65rem] text-slate-600 mt-1.5">
              Conseil : incluez les responsabilites, competences requises et culture d'entreprise.
            </p>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2" data-testid="profile-error">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-400 font-medium">Erreur</p>
              <p className="text-xs text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* Build button */}
        <div className="flex items-center gap-3">
          <button 
            type="submit"
            className="btn btn-primary text-sm flex-1"
            disabled={building || (!companyName.trim() && !jobDescription.trim())}
            data-testid="build-profile-btn"
          >
            {building ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{buildStep || 'Construction...'}</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {existingProfile?.available ? 'Reconstruire le profil' : 'Construire le profil'}
              </>
            )}
          </button>
        </div>

        {/* Results display */}
        {result && (
          <div className="space-y-4 pt-4 border-t border-white/[0.04]" data-testid="profile-result">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Profil cree avec succes!</span>
              <span className="text-sm text-slate-500">{result.doc_count} documents indexes</span>
            </div>

            {/* Company Summary */}
            {companySummary && (
              <div className="card-inner p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-display text-slate-400 uppercase tracking-wider">Entreprise</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{companySummary}</p>
              </div>
            )}

            {/* JD Analysis */}
            {jdSummary && (
              <div className="card-inner p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-accent" />
                  <span className="text-xs font-display text-slate-400 uppercase tracking-wider">Analyse du poste</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-3">{jdSummary}</p>
                
                {jdRequirements.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[0.65rem] text-slate-500 mb-1.5">Exigences cles:</p>
                    <div className="flex flex-wrap gap-1">
                      {jdRequirements.slice(0, 8).map((req, i) => (
                        <span key={i} className="chip chip-warn text-[0.6rem]">{req}</span>
                      ))}
                    </div>
                  </div>
                )}
                
                {jdKeywords.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[0.65rem] text-slate-500 mb-1.5">Mots-cles techniques:</p>
                    <div className="flex flex-wrap gap-1">
                      {jdKeywords.slice(0, 10).map((kw, i) => (
                        <span key={i} className="chip chip-accent text-[0.6rem]">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
                
                {potentialQuestions.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 mb-1.5">Questions probables:</p>
                    <ul className="space-y-1">
                      {potentialQuestions.slice(0, 5).map((q, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">&#8226;</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

function CacheSection() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const s = await getIngestionStatus();
      setStatus(s);
    } catch (e) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearProfileCache();
      await loadStatus();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-amber-300" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-sm">Cache vectoriel</h2>
          <p className="text-xs text-slate-500">Gérer l’index FAISS persistant</p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {loading ? (
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement du statut...
          </div>
        ) : status?.available ? (
          <div className="text-xs text-slate-300">
            Index actif · {status.doc_count || 0} documents
            {status.created_at && <span className="text-slate-500"> · {new Date(status.created_at).toLocaleString()}</span>}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Aucun index persisté pour le moment.</div>
        )}

        <button className="btn btn-danger-outline text-xs" onClick={handleClear} disabled={clearing}>
          {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Clear Cache
        </button>
      </div>
    </div>
  );
}

