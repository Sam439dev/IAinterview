import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Key, FileText, Brain, Upload, Check, Eye, EyeOff, Trash2, Loader2, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { getSettings, saveSettings, getActiveCV, uploadCV, deleteCV } from '../services/api';
import Navbar from '../components/Navbar';

export default function Settings() {
  return (
    <div className="min-h-screen bg-void cyber-grid">
      <Navbar title="PARAMÈTRES" showBack backTo="/dashboard" />
      <main className="max-w-3xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <ApiKeySection />
        <CVSection />
      </main>
    </div>
  );
}

function ApiKeySection() {
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(s => { setSettings(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const hasKey = settings?.has_key;

  const handleSave = async () => {
    if (!apiKey && !hasKey) return;
    setSaving(true);
    try {
      await saveSettings({
        openai_api_key: apiKey || undefined,
        preferred_model: model
      });
      const updated = await getSettings();
      setSettings(updated);
      setApiKey('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await saveSettings({ openai_api_key: '', preferred_model: model });
      const updated = await getSettings();
      setSettings(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cyber-card" data-testid="api-key-section">
      <div className="p-6 border-b border-slate-800/50">
        <h2 className="font-heading font-semibold text-lg tracking-wider flex items-center gap-2">
          <Key className="w-5 h-5 text-cyber-cyan" /> CLÉ API OPENAI
        </h2>
        <p className="text-sm text-slate-500 mt-1">Votre clé est stockée de manière sécurisée.</p>
      </div>
      <div className="p-6 space-y-4">
        {/* Status */}
        <div className={`flex items-center gap-2 p-3 ${hasKey ? 'bg-cyber-green/5 border border-cyber-green/30' : 'bg-cyber-orange/5 border border-cyber-orange/30'}`} data-testid="api-key-status">
          {hasKey ? (
            <><CheckCircle2 className="w-5 h-5 text-cyber-green" /><span className="text-sm text-cyber-green font-medium">Clé API configurée</span></>
          ) : (
            <><AlertCircle className="w-5 h-5 text-cyber-orange" /><span className="text-sm text-cyber-orange font-medium">Clé API non configurée</span></>
          )}
        </div>

        {/* Input */}
        <div>
          <label className="block font-heading text-xs tracking-wider text-slate-400 mb-2">
            {hasKey ? 'NOUVELLE CLÉ (laisser vide pour conserver)' : 'CLÉ API OPENAI'}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder={hasKey ? settings?.openai_api_key || '••••' : 'sk-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="input-cyber pr-10"
              data-testid="api-key-input"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost p-1" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Obtenez votre clé sur <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-cyber-cyan hover:underline">platform.openai.com</a>
          </p>
        </div>

        {/* Model */}
        <div>
          <label className="block font-heading text-xs tracking-wider text-slate-400 mb-2">MODÈLE PRÉFÉRÉ</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input-cyber" data-testid="model-select">
            <option value="gpt-4o-mini">GPT-4o Mini (Rapide & Économique)</option>
            <option value="gpt-4o">GPT-4o (Équilibré)</option>
            <option value="gpt-4-turbo">GPT-4 Turbo (Puissant)</option>
          </select>
          <p className="text-xs text-slate-600 mt-1">GPT-4o Mini est recommandé pour une latence optimale</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button className="btn-primary text-xs py-2.5 px-6 flex items-center gap-2" onClick={handleSave} disabled={saving} data-testid="save-settings-btn">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Sauvegarder
          </button>
          {hasKey && (
            <button className="btn-danger text-xs py-2.5 px-4 flex items-center gap-2" onClick={handleRemove} disabled={saving} data-testid="remove-key-btn">
              <Trash2 className="w-4 h-4" /> Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CVSection() {
  const fileInputRef = useRef(null);
  const [cv, setCv] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCV = async () => {
    try {
      const data = await getActiveCV();
      setCv(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCV(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'text/plain'];
    if (!validTypes.includes(file.type)) {
      alert('Format non supporté. Utilisez PDF ou TXT.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Fichier trop volumineux (max 5MB)');
      return;
    }

    setUploading(true);
    try {
      await uploadCV(file);
      await fetchCV();
    } catch (e) {
      console.error(e);
      alert('Erreur lors de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!cv?.id) return;
    try {
      await deleteCV(cv.id);
      setCv(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="cyber-card" data-testid="cv-section">
      <div className="p-6 border-b border-slate-800/50">
        <h2 className="font-heading font-semibold text-lg tracking-wider flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyber-green" /> MON CV
        </h2>
        <p className="text-sm text-slate-500 mt-1">Uploadez votre CV pour personnaliser les réponses.</p>
      </div>
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-cyber-cyan animate-spin" /></div>
        ) : cv ? (
          <div className="space-y-4">
            <div className="p-4 bg-void border border-slate-800/50">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyber-green/10 border border-cyber-green/30 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-cyber-green" />
                  </div>
                  <div>
                    <p className="text-sm font-medium" data-testid="cv-filename">{cv.file_name}</p>
                    <p className="text-xs text-slate-500">Uploadé le {new Date(cv.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
                <button className="btn-ghost p-1.5 text-cyber-magenta hover:bg-cyber-magenta/10" onClick={handleDelete} data-testid="delete-cv-btn">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {cv.parsed_data && (
                <div className="space-y-3 pt-3 border-t border-slate-800/50">
                  {cv.parsed_data.full_name && (
                    <p className="text-sm"><span className="text-slate-500">Nom:</span> <span className="text-cyber-cyan">{cv.parsed_data.full_name}</span></p>
                  )}
                  {cv.parsed_data.skills?.length > 0 && (
                    <div>
                      <p className="text-xs font-heading text-slate-500 mb-2 tracking-wider">COMPÉTENCES DÉTECTÉES</p>
                      <div className="flex flex-wrap gap-1">
                        {cv.parsed_data.skills.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {cv.parsed_data.technologies?.length > 0 && (
                    <div>
                      <p className="text-xs font-heading text-slate-500 mb-2 tracking-wider">TECHNOLOGIES</p>
                      <div className="flex flex-wrap gap-1">
                        {cv.parsed_data.technologies.map((t, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/20">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {cv.parsed_data.experiences?.length > 0 && (
                    <p className="text-xs text-slate-500">{cv.parsed_data.experiences.length} expérience(s) détectée(s)</p>
                  )}
                </div>
              )}
            </div>

            <div className="text-center">
              <input ref={fileInputRef} type="file" accept=".pdf,.txt" onChange={handleUpload} className="hidden" />
              <button className="btn-secondary text-xs py-2 px-4 flex items-center gap-2 mx-auto" onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="replace-cv-btn">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Remplacer le CV
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 border border-slate-800 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="font-heading text-lg mb-2 text-slate-300">AUCUN CV</h3>
            <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
              Uploadez votre CV pour que l'assistant génère des réponses personnalisées.
            </p>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt" onChange={handleUpload} className="hidden" />
            <button className="btn-primary text-xs py-2.5 px-6 flex items-center gap-2 mx-auto" onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="upload-cv-btn">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Uploader mon CV
            </button>
            <p className="text-xs text-slate-600 mt-3">Formats acceptés : PDF, TXT (max 5MB)</p>
          </div>
        )}
      </div>
    </div>
  );
}
