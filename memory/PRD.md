# Interview Assistant AI - PRD v3.0

## Énoncé du Problème
Assistant IA d'entretien avec analyse audio en temps réel. Un copilote expert qui aide le candidat à répondre aux questions d'un recruteur avec précision, crédibilité et profondeur variable.

## Prompt Copilote Expert (v3.0)

### Identité
**Métaphore**: Stratège silencieux qui chuchote des conseils précis – jamais un remplaçant.

### Règles Fondamentales (Inviolables)

1. **Extensibilité obligatoire**
   - ❌ INTERDIT: Réponses fermées
   - ✅ OBLIGATOIRE: Points d'entrée pour approfondissement

2. **Ancrage CV systématique**
   - ❌ INTERDIT: Exemples génériques, théories abstraites
   - ✅ OBLIGATOIRE: Citer éléments concrets du CV

3. **Non-redondance stricte**
   - ❌ INTERDIT: Répéter information reformulée
   - ✅ OBLIGATOIRE: Chaque échange apporte nouvelle couche

### Architecture des Réponses

**Niveau 1 - Réponse Initiale**
- Accroche: Reformulation implicite
- Cœur: 2-3 points clés actionnables
- Ouverture: Indice d'approfondissement possible

**Niveau 2 - Approfondissement**
- Contexte spécifique → Action concrète → Résultat → Lien question

### Méthode PAIR (Questions Complexes)
- **P**roblème: Reformulation + vrais enjeux
- **A**nalyse: Contraintes, paramètres
- **I**mplémentation: Solution + compromis
- **R**ésultats: Impacts, indicateurs

### Gestion des Pièges
- Question bateau → Illustrer par situations CV
- Relance inattendue → Activer niveau 2 avec ancrage CV
- Blocage → Structure de rattrapage

## Architecture Technique

```
/app/
├── backend/server.py
│   ├── COPILOT_SYSTEM_PROMPT (prompt expert complet)
│   ├── fast_analyze_v3 (avec contexte conversation + non-redondance)
│   ├── build_cv_context_rich (contexte CV exhaustif)
│   └── Détection flux conversationnel continu
└── frontend/
    └── Settings.js (affichage CV complet: skills_hard, skills_soft, technologies, methodologies)
```

## Flux de Traitement

```
Audio 3s → Whisper (20s) → Auto-detect langue
                              ↓
              Small talk filter (conservateur)
                              ↓
              fast_analyze_v3 avec COPILOT_SYSTEM_PROMPT
                              ↓
              Suggestion structurée (Accroche + Cœur + Ouverture)
                              ↓
              Ancrage CV obligatoire
```

## CV - Données Exploitées
- full_name, current_role, years_experience, seniority
- experiences (avec key_achievements, technologies_used)
- skills_hard, skills_soft
- technologies, methodologies
- education, certifications
- strengths, unique_value
- languages_spoken, industries

## Tests Validés
- CV affichage complet: ✅
- Détection intentions: ✅ (prompt expert)
- Ancrage CV: ✅ (règle inviolable)
- Non-redondance: ✅ (check dernière suggestion)

## Backlog
### P1
- Export session PDF
- Raccourcis clavier

### P2
- Multi-langue étendu
- Upload description de poste
- Mode entraînement
