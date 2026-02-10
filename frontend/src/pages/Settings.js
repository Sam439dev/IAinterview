import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Key, FileText, Upload, Check, Eye, EyeOff, Trash2, Loader2, AlertCircle, CheckCircle2, ExternalLink, Briefcase, GraduationCap, Code2, Star, RefreshCw } from 'lucide-react';
import { getSettings, saveSettings, validateKey, getActiveCV, uploadCV, deleteCV, reparseCV } from '../services/api';
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
  const [show, setShow] = useState(false);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);

  useEffect(() => { getSettings().then(s => { setSettings(s); setModel(s.preferred_model || 'gpt-4o-mini'); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const hasKey = settings?.has_key;

  const handleValidate = async () => {
    if (!key) return;
    setValidating(true);
    setValidation(null);
    try {
      const r = await validateKey(key);
      setValidation(r);
    } catch { setValidation({ valid: false, error: 'Erreur réseau' }); }
    finally { setValidating(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({ openai_api_key: key || undefined, preferred_model: model });
      const u = await getSettings();
      setSettings(u);
      setKey('');
      setValidation(null);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleRemove = async () => {
    if (!window.confirm('Supprimer votre clé API ?')) return;
    setSaving(true);
    try {
      await saveSettings({ openai_api_key: '', preferred_model: model });
      setSettings(await getSettings());
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="card" data-testid="api-key-section">
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
          <Key className="w-4 h-4 text-accent" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-sm">Clé API OpenAI</h2>
          <p className="text-xs text-slate-500">Votre clé est stockée localement</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {/* Status */}
        <div className={`flex items-center gap-2.5 p-3 rounded-lg ${hasKey ? 'bg-emerald-500/[0.06] border border-emerald-500/15' : 'bg-amber-500/[0.06] border border-amber-500/15'}`} data-testid="key-status">
          {hasKey
            ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-sm text-emerald-400 font-medium">Clé API configurée</span><span className="text-xs text-slate-500 ml-auto font-mono">{settings?.openai_api_key}</span></>
            : <><AlertCircle className="w-4 h-4 text-amber-400" /><span className="text-sm text-amber-400 font-medium">Clé API requise</span></>
          }
        </div>

        {/* Input */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-display">{hasKey ? 'Nouvelle clé (optionnel)' : 'Clé API OpenAI'}</label>
          <div className="relative">
            <input type={show ? 'text' : 'password'} value={key} onChange={e => { setKey(e.target.value); setValidation(null); }}
              placeholder={hasKey ? 'Laisser vide pour conserver' : 'sk-proj-...'} className="input pr-20" data-testid="api-key-input" />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              <button className="btn-ghost p-1.5" onClick={() => setShow(!show)}>{show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
              {key && <button className="btn btn-outline text-[0.6rem] py-1 px-2" onClick={handleValidate} disabled={validating}>
                {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Tester'}
              </button>}
            </div>
          </div>
          {validation && (
            <p className={`text-xs mt-1.5 flex items-center gap-1 ${validation.valid ? 'text-emerald-400' : 'text-red-400'}`}>
              {validation.valid ? <><CheckCircle2 className="w-3 h-3" /> Clé valide</> : <><AlertCircle className="w-3 h-3" /> {validation.error}</>}
            </p>
          )}
          <p className="text-xs text-slate-600 mt-1.5">
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
              Obtenir une clé <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-display">Modèle GPT</label>
          <select value={model} onChange={e => setModel(e.target.value)} className="input" data-testid="model-select">
            <option value="gpt-4o-mini">GPT-4o Mini - Rapide et économique</option>
            <option value="gpt-4o">GPT-4o - Équilibré</option>
            <option value="gpt-4-turbo">GPT-4 Turbo - Puissant</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button className="btn btn-primary text-xs" onClick={handleSave} disabled={saving} data-testid="save-btn">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Sauvegarder
          </button>
          {hasKey && (
            <button className="btn btn-danger-outline text-xs" onClick={handleRemove} disabled={saving} data-testid="remove-key-btn">
              <Trash2 className="w-3.5 h-3.5" /> Supprimer
            </button>
          )}
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
    try { const updated = await reparseCV(); setCv(updated); } catch (e) { alert("Erreur de re-parsing. Vérifiez votre clé API."); }
    finally { setReparsing(false); }
  };

  const handleDel = async () => {
    if (!cv?.id || !window.confirm('Supprimer ce CV ?')) return;
    try { await deleteCV(cv.id); setCv(null); } catch {}
  };

  const hasParsedData = cv?.parsed_data && (cv.parsed_data.skills?.length > 0 || cv.parsed_data.full_name || cv.parsed_data.experiences?.length > 0);

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

                {cv.parsed_data.skills?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider flex items-center gap-1"><Code2 className="w-3 h-3" /> COMPÉTENCES</p>
                    <div className="flex flex-wrap gap-1">{cv.parsed_data.skills.map((s, i) => <span key={i} className="chip chip-accent text-[0.6rem]">{s}</span>)}</div>
                  </div>
                )}

                {cv.parsed_data.technologies?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider">TECHNOLOGIES</p>
                    <div className="flex flex-wrap gap-1">{cv.parsed_data.technologies.map((t, i) => <span key={i} className="chip chip-purple text-[0.6rem]">{t}</span>)}</div>
                  </div>
                )}

                {cv.parsed_data.experiences?.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] text-slate-500 font-display mb-1.5 tracking-wider flex items-center gap-1"><Briefcase className="w-3 h-3" /> EXPÉRIENCES</p>
                    <div className="space-y-1.5">
                      {cv.parsed_data.experiences.slice(0, 3).map((e, i) => (
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
