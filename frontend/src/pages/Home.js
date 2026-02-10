import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Mic, FileText, BarChart3, Zap, Shield, ChevronRight, Globe, Clock } from 'lucide-react';
import { getSettings } from '../services/api';

export default function Home() {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    getSettings().then(s => setHasKey(s.has_key)).catch(() => {});
  }, []);

  const features = [
    { icon: Mic, title: 'Transcription Temps Réel', desc: 'Capture audio via navigateur avec transcription Whisper en moins de 2 secondes. Détection automatique de la voix.', color: 'cyan' },
    { icon: Brain, title: 'Détection Naturelle', desc: "L'IA analyse le contexte conversationnel pour identifier questions, mises en situation et demandes implicites.", color: 'purple' },
    { icon: FileText, title: 'Intégration CV', desc: 'Upload PDF avec extraction structurée. Vos expériences et compétences sont injectées dans chaque réponse.', color: 'green' },
    { icon: Zap, title: 'Réponses Instantanées', desc: 'Génération de réponses personnalisées en temps réel. Méthode STAR pour les questions comportementales.', color: 'orange' },
    { icon: BarChart3, title: 'Analytics Détaillés', desc: 'Dashboard avec historique, types de questions détectées, latences moyennes et progression.', color: 'magenta' },
    { icon: Shield, title: 'Confidentialité Totale', desc: 'Votre clé API OpenAI est stockée localement. Vos données de session vous appartiennent.', color: 'cyan' },
  ];

  const colorMap = {
    cyan: { border: 'border-cyber-cyan/30', bg: 'bg-cyber-cyan/10', text: 'text-cyber-cyan', glow: 'hover:glow-cyan' },
    purple: { border: 'border-cyber-purple/30', bg: 'bg-cyber-purple/10', text: 'text-cyber-purple', glow: 'hover:glow-purple' },
    green: { border: 'border-cyber-green/30', bg: 'bg-cyber-green/10', text: 'text-cyber-green', glow: 'hover:glow-green' },
    orange: { border: 'border-cyber-orange/30', bg: 'bg-cyber-orange/10', text: 'text-cyber-orange' },
    magenta: { border: 'border-cyber-magenta/30', bg: 'bg-cyber-magenta/10', text: 'text-cyber-magenta', glow: 'hover:glow-magenta' },
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cyber-cyan/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyber-purple/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-slate-800/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6 lg:px-12">
          <Link to="/" className="flex items-center gap-3" data-testid="home-logo">
            <div className="w-10 h-10 border border-cyber-cyan/50 flex items-center justify-center glow-cyan">
              <Brain className="w-6 h-6 text-cyber-cyan" />
            </div>
            <span className="font-heading font-bold text-xl tracking-widest text-cyber-cyan text-glow-cyan">
              INTERVIEW AI
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/dashboard" data-testid="home-dashboard-link">
              <button className="btn-ghost font-heading text-sm tracking-wider">Tableau de bord</button>
            </Link>
            <Link to={hasKey ? '/interview' : '/settings'} data-testid="home-start-btn">
              <button className="btn-primary flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Démarrer
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 py-24 lg:py-36">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-cyber-cyan/30 bg-cyber-cyan/5 mb-8">
            <Zap className="w-4 h-4 text-cyber-cyan" />
            <span className="text-sm text-cyber-cyan font-medium font-heading tracking-wider">PROPULSÉ PAR L'IA</span>
          </div>

          <h1 className="font-heading font-bold text-5xl md:text-7xl lg:text-8xl leading-[0.9] mb-8">
            <span className="gradient-text">MAÎTRISEZ</span>
            <br />
            <span className="text-white">VOS ENTRETIENS</span>
            <br />
            <span className="text-cyber-purple text-glow-purple">TECHNIQUES</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed">
            Entraînez-vous avec une IA qui comprend le contexte, détecte les questions naturellement
            et génère des réponses personnalisées basées sur votre CV.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link to={hasKey ? '/interview' : '/settings'} data-testid="hero-start-btn">
              <button className="btn-primary text-lg px-8 py-4 flex items-center gap-3">
                <Mic className="w-5 h-5" />
                Commencer l'entraînement
              </button>
            </Link>
            <Link to="/dashboard" data-testid="hero-demo-btn">
              <button className="btn-secondary text-lg px-8 py-4 flex items-center gap-2">
                Voir le tableau de bord
                <ChevronRight className="w-5 h-5" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 py-20">
        <div className="mb-16">
          <h2 className="font-heading font-bold text-3xl md:text-4xl mb-4">
            <span className="text-cyber-cyan text-glow-cyan">FONCTIONNALITÉS</span> AVANCÉES
          </h2>
          <p className="text-slate-400 max-w-xl">
            Une suite complète d'outils pour vous préparer aux entretiens les plus exigeants.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const c = colorMap[f.color];
            return (
              <div
                key={i}
                className={`cyber-card p-6 ${c.glow || ''} transition-all duration-300 group`}
                style={{ animationDelay: `${i * 0.1}s` }}
                data-testid={`feature-card-${i}`}
              >
                <div className={`w-12 h-12 ${c.bg} ${c.border} border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <f.icon className={`w-6 h-6 ${c.text}`} />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2 text-white">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 py-20">
        <div className="cyber-card p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-cyan to-transparent" />
          <h2 className="font-heading font-bold text-2xl md:text-3xl mb-4">
            PRÊT À <span className="text-cyber-cyan text-glow-cyan">DOMINER</span> VOS ENTRETIENS ?
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto mb-8">
            Configurez votre clé API OpenAI et commencez à vous entraîner immédiatement.
          </p>
          <Link to={hasKey ? '/interview' : '/settings'} data-testid="cta-start-btn">
            <button className="btn-primary text-lg px-8 py-4 flex items-center gap-2 mx-auto">
              {hasKey ? 'Accéder à mon espace' : 'Configurer et commencer'}
              <ChevronRight className="w-5 h-5" />
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/50 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyber-cyan" />
            <span className="font-heading text-xs tracking-widest text-slate-500">INTERVIEW AI &copy; 2025</span>
          </div>
          <p className="text-xs text-slate-600">Propulsé par OpenAI Whisper & GPT</p>
        </div>
      </footer>
    </div>
  );
}
