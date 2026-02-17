import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Key, FileText, Upload, Check, Eye, EyeOff, Trash2, Loader2, AlertCircle, CheckCircle2, ExternalLink, Briefcase, GraduationCap, Code2, Star, RefreshCw } from 'lucide-react';
import { getActiveCV, uploadCV, deleteCV, reparseCV } from '../services/api';
import { loadLlmSettings, saveLlmSettings, hasActiveKey } from '../services/llmSettings';
import Navbar from '../components/Navbar';

export default function Settings() {
  return (
    <div className="min-h-screen bg-void">
      <Navbar title="Paramètres" showBack backTo="/dashboard" />
      <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        <ApiKeySection />
        <CVSection />
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

  const handleSave = () => {
    saveLlmSettings({ provider, model, keys, sttOpenAIKey: sttKey });
    setSaved(true);
  };

  const handleClearProvider = () => {
    setKeys(prev => ({ ...prev, [provider]: '' }));
  };

  const handleKeyChange = (value) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="card" data-testid="api-key-section">
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
              className="input pr-12"
              data-testid="api-key-input"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              <button className="btn-ghost p-1.5" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
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
              className="input pr-12"
              data-testid="stt-key-input"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              <button className="btn-ghost p-1.5" onClick={() => setShowStt(!showStt)}>
                {showStt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-1.5">
            Requis si votre fournisseur LLM n'est pas OpenAI (en attendant la transcription locale).
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button className="btn btn-primary text-xs" onClick={handleSave} data-testid="save-btn">
            <Check className="w-4 h-4" /> Sauvegarder localement
          </button>
          <button className="btn btn-danger-outline text-xs" onClick={handleClearProvider} data-testid="remove-key-btn">
            <Trash2 className="w-3.5 h-3.5" /> Effacer la clé
          </button>
          {saved && <span className="text-xs text-emerald-400">Sauvegardé ✓</span>}
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
        alert("Clé API OpenAI invalide. Mettez à jour votre clé dans la section ci-dessus, puis re-parsez le CV.");
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
