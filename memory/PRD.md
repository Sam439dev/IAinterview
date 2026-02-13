# Interview Assistant AI - PRD v3.1

## Énoncé du Problème
Assistant IA d'entretien avec analyse audio en temps réel. Un copilote expert qui aide le candidat à répondre aux questions d'un recruteur avec précision, crédibilité et profondeur variable.

## Prompt Copilote Expert V2 - EXPLORATION EXHAUSTIVE DU CV

### Règles Fondamentales (4 règles inviolables)

1. **Extensibilité obligatoire** - Chaque réponse contient des points d'entrée pour approfondir
2. **Ancrage CV systématique** - Citer éléments concrets du CV, pas de généricités
3. **EXPLORATION EXHAUSTIVE DU CV** (NOUVELLE) - Parcourir TOUTES les expériences (anciennes ET récentes), sélectionner LA PLUS PERTINENTE indépendamment de l'ancienneté
4. **Non-redondance stricte** - Chaque échange apporte une couche d'information nouvelle

### Mécanisme d'Extraction CV

```
1. Parcours TOUTES les expériences (ancienne → récente)
2. Évalue la pertinence de CHAQUE expérience
3. NE TE LAISSE PAS BIAISER par l'ordre chronologique
4. Une expérience de 2022 peut être PLUS PERTINENTE qu'une de 2024
5. Privilégie l'exemple le plus concret (chiffres, situations, défis)
```

### Exemple d'Application
- Question: "Avez-vous géré une crise client ?"
- CV: VOLT 2024 (projet classique) vs BFORBANK 2023 (vraie crise client)
- ✅ SÉLECTIONNER BFORBANK même si plus ancien
- ❌ NE PAS se contenter de VOLT sous prétexte qu'il est récent

### Gestion du Biais de Récence
- NE PAS toujours citer la dernière expérience
- La PERTINENCE prime sur la CHRONOLOGIE
- Vérification mentale: "Ai-je exploré TOUTES les expériences ?"

## Améliorations Techniques v3.1

### Backend (server.py)
- `build_cv_context_rich()` : Affiche TOUTES les expériences sans limite
- Format structuré: `[EXPÉRIENCE 1]`, `[EXPÉRIENCE 2]`, etc.
- Inclut TOUTES les réalisations clés (pas de troncation)
- Marqueur explicite: "EXPLORER TOUTES LES EXPÉRIENCES"

### Frontend (Settings.js)
- Affiche TOUTES les expériences (plus de `.slice(0, 3)`)
- Compteur: "EXPÉRIENCES (4)"

### Contexte CV Complet
```
=== PARCOURS PROFESSIONNEL COMPLET (à explorer intégralement) ===

[EXPÉRIENCE 1] Product Manager / Product Owner @ VOLT Superfoods (2024-2025)
  RÉALISATIONS CLÉS:
    • Site e-commerce lancé en 3 mois
    • Taux de conversion de 3%

[EXPÉRIENCE 2] Product Owner @ M6 Publicité (2024)
  RÉALISATIONS CLÉS:
    • Formation de 100+ utilisateurs
    • Amélioration KPI de 30%

[EXPÉRIENCE 3] Product Manager / Product Owner @ BFORBANK (2023)
  RÉALISATIONS CLÉS:
    • Analyse de 1000+ feedbacks clients
    • Intégration Live Chat mobile

[EXPÉRIENCE 4] Product Owner / Scrum Master @ BNP PARIBAS (2022)
  RÉALISATIONS CLÉS:
    • Hub de communication multicanal
    • Vision 360 client

=== FIN DU PARCOURS - SÉLECTIONNER L'EXPÉRIENCE LA PLUS PERTINENTE ===
```

## Tests Validés
- ✅ CV avec 4 expériences complètes
- ✅ Contexte CV 3095 caractères (complet)
- ✅ Toutes les expériences incluses dans le contexte
- ✅ Prompt V2 avec exploration exhaustive

## Backlog
### P1
- Export session PDF
- Raccourcis clavier

### P2
- Multi-langue étendu
- Upload description de poste
