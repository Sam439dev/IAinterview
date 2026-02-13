# Interview Assistant AI - PRD

## Énoncé du Problème
Assistant IA d'entretien avec analyse audio en temps réel. L'agent écoute en continu, détecte les questions du recruteur, et génère des suggestions de réponses personnalisées basées sur le CV du candidat.

## Architecture
- **Frontend**: React CRA + Tailwind CSS + React Router + ReactMarkdown + ShadCN UI
- **Backend**: FastAPI + Motor (MongoDB async) + httpx (OpenAI Whisper + GPT)
- **AI**: Whisper (transcription + détection langue) + GPT-4o-mini (analyse questions + génération réponses)
- **DB**: MongoDB (user_settings, cv_documents, interview_sessions, conversation_messages)

## Exigences Critiques (IMPLÉMENTÉES ✅)
1. **Vivacité et Réactivité**: Latence cible ≤2s entre fin question et affichage suggestion
2. **Détection Linguistique Dynamique**: Auto-détection FR/EN via Whisper, adaptation instantanée
3. **Performance et Priorisation**: Génération temps réel prioritaire, post-processing différé
4. **Élimination du Small Talk**: Filtrage pré-GPT des salutations et politesses
5. **Comportement Post-Session**: Transcription complète + résumé structuré

## Flux Principal

### Pendant la Session
1. Enregistrement audio continu → chunks de 4 secondes
2. Whisper transcrit + détecte la langue (silencieusement)
3. Filtrage small talk pré-GPT (économise ~1-2s)
4. GPT analyse si question actionnable → génère suggestion personnalisée
5. Suggestion affichée avec catégorie, points clés, conseil de ton
6. **Pas de transcription affichée** pendant la session

### À la Fin de Session
1. Bouton "Arrêter et résumer" → génère transcription complète
2. Résumé structuré: questions identifiées, paires Q/R, insights globaux

## Optimisations de Performance (Dec 2025)
- **Whisper**: Timeout 30s, auto-detect langue (pas de param language)
- **GPT**: Timeout 20s, max_tokens 800, température 0.5
- **Prompt Lean**: ~100 tokens système, format JSON compact
- **Contexte Réduit**: 2 derniers messages, CV tronqué à 1500 chars
- **Filtrage Pré-GPT**: Patterns small talk FR/EN avant appel API

## Ce Qui a Été Implémenté (V7 - Dec 2025)

### Pipeline Haute Performance
- Chunks audio 4s (au lieu de 8s)
- Filtrage small talk local avant GPT (~1-2s économisés)
- Prompt optimisé pour rapidité
- Timeouts réduits (30s Whisper, 20s GPT)
- Auto-détection langue FR/EN

### UI/UX Français
- Page d'accueil avec "Votre coach d'entretien invisible et intelligent"
- Dashboard avec statistiques (sessions, questions, latence moyenne)
- Page Interview avec badges: CV, Langue, Compteur questions, Timer, Latence
- Page Paramètres: Clé API, sélection modèle, gestion CV
- Thème sombre professionnel

### Backend APIs
- CRUD Sessions avec limite 10
- Process Audio optimisé pour latence
- Génération résumé post-session
- Validation clé API
- Upload et parsing CV

## Tests (V7)
- **Backend**: 100% (19/19 tests)
- **Frontend**: 100% (toutes pages, tous data-testid)
- **Rapport**: /app/test_reports/iteration_7.json

## Backlog
### P1 (Prioritaire)
- Export session PDF
- Raccourcis clavier

### P2 (Futur)
- Multi-langue étendu
- Upload description de poste
- Mode entraînement avec questions types
