import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, FileText, BarChart3, Zap, Shield, ChevronRight, Sparkles, Brain, Copy } from 'lucide-react';
import { hasActiveKey } from '../services/llmSettings';

export default function Home() {
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => { setHasKey(hasActiveKey()); }, []);

  const startHref = hasKey ? '/interview' : '/settings';

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/[0.04] rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-accent2/[0.03] rounded-full blur-[150px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-20 border-b border-white/[0.04] backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Mic className="w-4 h-4 text-accent" />
            </div>
            <span className="font-display font-bold text-base tracking-wide" data-testid="home-logo">InterviewAI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/dashboard"><button className="btn btn-ghost text-xs" data-testid="home-nav-dashboard">Tableau de bord</button></Link>
            <Link to={startHref}><button className="btn btn-primary text-xs" data-testid="home-nav-start">Commencer</button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-16 lg:pt-32 lg:pb-24">
        <div className="max-w-3xl">
          <div className="chip chip-accent mb-6" data-testid="hero-badge">
            <Sparkles className="w-3 h-3" /> Assistant IA en temps réel
          </div>
          <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-[3.5rem] leading-[1.1] mb-6" data-testid="hero-title">
            Votre coach d'entretien
            <br />
            <span className="text-accent">invisible et intelligent</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-400 max-w-xl mb-10 leading-relaxed" data-testid="hero-subtitle">
            Pendant votre entretien, l'IA écoute en continu, détecte les questions du recruteur 
            et vous suggère des réponses personnalisées basées sur votre CV. La transcription complète est générée à la fin.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to={startHref}>
              <button className="btn btn-primary text-sm px-8 py-3.5" data-testid="hero-cta">
                <Mic className="w-4 h-4" /> Lancer une session
              </button>
            </Link>
            <Link to="/dashboard">
              <button className="btn btn-outline text-sm px-6 py-3.5" data-testid="hero-dashboard">
                Voir mes sessions <ChevronRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl mb-12" data-testid="how-title">
          Comment ça marche
        </h2>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { step: '01', icon: Mic, title: 'Démarrez l\'écoute', desc: 'Lancez l\'enregistrement et l\'IA écoute votre conversation en continu via le micro du navigateur.' },
            { step: '02', icon: Brain, title: 'Détection intelligente', desc: 'L\'IA analyse l\'audio en temps réel pour identifier les questions et intentions du recruteur.' },
            { step: '03', icon: Copy, title: 'Suggestions instantanées', desc: 'Des réponses personnalisées basées sur votre CV apparaissent dès qu\'une question est détectée.' },
          ].map((s, i) => (
            <div key={i} className="card p-6 group" data-testid={`step-card-${i}`}>
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-xs text-accent/50">{s.step}</span>
                <div className="w-10 h-10 rounded-lg bg-accent/[0.06] border border-accent/10 flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                  <s.icon className="w-5 h-5 text-accent" />
                </div>
              </div>
              <h3 className="font-display font-semibold text-base mb-2">{s.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl mb-12" data-testid="features-title">
          Fonctionnalités
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Mic, label: 'Analyse audio', desc: 'Enregistrement continu avec analyse par chunks via OpenAI Whisper', chip: 'AUDIO' },
            { icon: Brain, label: 'Analyse contextuelle', desc: 'Détection de questions techniques, comportementales et situationnelles', chip: 'GPT-4o' },
            { icon: FileText, label: 'CV intelligent', desc: 'Upload PDF, extraction structurée et personnalisation des réponses', chip: 'CV' },
            { icon: Zap, label: 'Pipeline rapide', desc: 'Transcription + analyse + réponse en quelques secondes', chip: 'RAPIDE' },
            { icon: BarChart3, label: 'Analytics', desc: 'Historique des sessions, questions détectées et latences', chip: 'STATS' },
            { icon: Shield, label: 'Vos données, vos clés', desc: 'Vos clés API restent locales, rien n’est stocké sur nos serveurs', chip: 'PRIVÉ' },
          ].map((f, i) => (
            <div key={i} className="card-inner p-5 flex gap-4" data-testid={`feature-${i}`}>
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/[0.03] flex items-center justify-center">
                <f.icon className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display text-sm font-medium">{f.label}</h3>
                  <span className="chip chip-neutral text-[0.6rem]">{f.chip}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-16 pb-24">
        <div className="card p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
          <h2 className="font-display font-bold text-2xl mb-3">
            Prêt pour votre prochain entretien ?
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            {hasKey ? 'Vos clés API sont configurées. Lancez une session maintenant.' : 'Configurez vos clés API pour commencer.'}
          </p>
          <Link to={startHref}>
            <button className="btn btn-primary px-8 py-3" data-testid="cta-btn">
              {hasKey ? 'Lancer une session' : 'Configurer et commencer'}
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <span className="text-xs text-slate-600 font-mono">InterviewAI v2.0</span>
          <span className="text-xs text-slate-600">OpenAI Whisper + GPT</span>
        </div>
      </footer>
    </div>
  );
}
