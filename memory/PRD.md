# Interview Assistant AI - PRD v3.2

## Problème Racine Résolu ✅

Le parsing du CV s'arrêtait après ~15000 caractères, ignorant les pages 8-13 du document.

### Avant (Problème)
- Extraction limitée à 15000 caractères
- Parsing limité à 10000 caractères
- Seulement 4 expériences sur 10 extraites
- 6 entreprises manquantes (Crédit du Nord, BNP ALMT, Malakoff, Allianz, Euler, TATV)

### Après (Solution)
- Extraction COMPLÈTE de TOUTES les pages (13 pages, 36259 caractères)
- Parsing avec 50000 caractères max et 4000 tokens
- **10 expériences sur 10 extraites** ✅
- Toutes les entreprises présentes dans le contexte

## Modifications Techniques

### 1. `extract_cv_text()` - SANS LIMITE
```python
# Avant: return "".join(...)[:15000]
# Après: return full_text  # PAS DE LIMITE
```
- Marque chaque page: `[PAGE 1]`, `[PAGE 2]`, etc.
- Log du nombre de pages et caractères

### 2. `parse_cv_llm()` - Limites augmentées
```python
# Avant: raw_text[:10000], max_tokens=2500
# Après: raw_text[:50000], max_tokens=4000, timeout=90s
```

### 3. `CV_PARSE_PROMPT` - Instructions explicites
- "PARCOURS TOUTES LES PAGES DU DOCUMENT"
- "NE T'ARRÊTE PAS après les premières expériences"
- "LE NOMBRE D'EXPÉRIENCES DOIT CORRESPONDRE AU CONTENU RÉEL"

### 4. Nouvel endpoint `/api/cv/upload-from-url`
- Télécharge le CV depuis une URL
- Extrait TOUTES les pages
- Parse avec les nouvelles limites

### 5. `reparse_cv()` amélioré
- Re-extrait le texte depuis le fichier original stocké
- Ne se fie plus au raw_text tronqué

## CV Actuel - 10 Expériences

| # | Entreprise | Période | Réalisations |
|---|------------|---------|--------------|
| 1 | VOLT Superfoods | 2024-Présent | 3 |
| 2 | M6 Publicité | 02-11/2024 | 3 |
| 3 | BFORBANK | 2022-2024 | 3 |
| 4 | BNP PARIBAS | 2021-2022 | 2 |
| 5 | Groupe Crédit du Nord | 2020-2021 | 2 |
| 6 | BNP PARIBAS ALMT IT | 2019-2020 | 2 |
| 7 | MALAKOFF MEDERIC | 2017-2018 | 2 |
| 8 | ALLIANZ INFORMATIQUE | 2016-2017 | 2 |
| 9 | EULER HERMES | 2016 | 2 |
| 10 | TATV/Touring assurance | 2015-2016 | 2 |

## Contexte CV pour l'Agent
- **5769 caractères** de contexte structuré
- Toutes les 10 entreprises présentes
- Toutes les réalisations clés incluses

## Critères de Validation ✅
- [x] Expérience en dernière page (TATV) mobilisable
- [x] Projets absents de la première page mentionnables
- [x] Nombre d'expériences non limité artificiellement
- [x] Réponses approfondies cohérentes et contextualisées

## Backlog
### P1
- Export session PDF
- Raccourcis clavier

### P2
- Multi-langue étendu
- Upload description de poste
