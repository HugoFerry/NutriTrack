# NutriTrack

App perso de suivi nutritionnel, local-first : APK Android (Capacitor) et version web publiée comme artefact Claude. Tout est en français : interface, commentaires, messages de commit.

## Commandes

- `npm run dev` : http://localhost:5173 (tout marche dans le navigateur sauf scan, rappels et Health Connect)
- `npm test` : Vitest (IndexedDB simulée par `fake-indexeddb`)
- `npm run typecheck` : `tsc -b`
- `npm run lint` : oxlint
- `npm run build:artifact` : version web dans `dist-artifact/`
- Avant de considérer une modification comme terminée : `npm run typecheck && npm test` (la CI lance les mêmes commandes avant de construire l'APK).

## Architecture

- `src/domain/` : calculs purs et testés (BMR, TDEE, TDEE adaptatif, cibles, suggestions, rapprochement des réponses du chat IA avec la base dans `aiFoods.ts`, sport dans `training.ts` : séance suggérée, dernière performance, ordre et supersets, résumés pour le coach ; trajet et tapis autour des séances dans `activity.ts`). Aucune dépendance à Dexie ni à React.
- `src/data/` : Dexie (IndexedDB). Schéma `db.ts`, aliments et recettes de départ `seed.ts`, dépôts `repos.ts`, sauvegarde `backup.ts`, synchro de la version artefact `sync.ts`.
- `src/services/` : Anthropic (chat + vision, `ai.ts`), Open Food Facts, scanner, notifications, plateforme (`platform.ts` : APK, artefact ou navigateur).
- `src/ui/` : React, avec `screens/`, `components/` et `hooks/` (live queries Dexie). L'écran Sport est dans `screens/Sport.tsx`, ses éditeurs (catalogue, glisser-déposer, séance type) dans `screens/SportEditors.tsx`.
- `android/` : projet Capacitor généré, versionné.

## Règles

- Valeurs nutritionnelles pour 100 g (ou 100 ml) : `cal`, `p` protéines, `g` glucides, `l` lipides, `fib` fibres.
- Modifier les aliments de base (`S` dans `src/data/seed.ts`) impose d'incrémenter `SEED_VERSION` ; modifier `SEED_RECIPES` impose d'incrémenter `SEED_RECIPES_VERSION`. Sans ça, les appareils déjà installés ne voient pas le changement. Procédure complète : skill `/ajout-aliment`.
- Programme sportif et catalogue d'exercices de départ : `src/data/training-seed.ts` (programme de l'utilisateur, transcrit de ses fiches, et ses règles d'enchaînement). Modifier le catalogue impose d'incrémenter `SEED_TRAINING_VERSION` ; le programme est réappliqué à chaque démarrage (`ensureSeedPrograms`), sauf les séances types modifiées dans l'app (source `custom`), jamais réécrites. Un exercice cité par le programme doit exister dans le catalogue (test dans `src/data/__tests__/training.test.ts`).
- Les calories d'activité (trajet, tapis incliné, séances, Health Connect) ne s'ajoutent jamais à la cible du jour : la dépense, mesurée ou donnée par le niveau d'activité du profil, les contient déjà. Elles sont estimées (`activity.ts`) pour le suivi et le coach seulement ; le seul levier sur la cible est le cyclage des glucides, qui déplace des calories vers les jours d'entraînement sans changer la semaine.
- Renommer un aliment de base change son identifiant (`seedId(catégorie, nom)`) : il disparaît chez l'utilisateur et les recettes qui le citent doivent suivre.
- Toute fonctionnalité doit se dégrader proprement dans la version artefact (pas d'Open Food Facts, de scanner, de Health Connect ni de rappels) : passer par `services/platform.ts` et `services/artifact.ts`.
- Pas de backend : les données ne quittent l'appareil que par l'export JSON ou par l'API Anthropic (clé saisie par l'utilisateur).
- Chaque push sur GitHub lance le build APK (`.github/workflows/android.yml`) : ne pas pousser sans demande explicite.
- Version artefact : les données vivent aussi dans la base de l'artefact (https://claude.ai/artifact/7kcJN1VkJTQhffZWvLmcma), lisible et modifiable avec l'outil `ArtifactData`. Toute écriture venue d'ailleurs que l'app doit porter `updatedAt` = maintenant en millisecondes, sinon la synchro (`src/data/sync.ts`) ignore le changement puis l'écrase.
- Republier la version web : skill `/publier-artefact`, seulement à la demande explicite de l'utilisateur (« pousse » pour pousser aussi sur GitHub, « simulation » pour vérifier et construire sans rien publier).
- Les aliments « à vérifier » créés par le chat IA sont révisés chaque soir à 22 h 30 par la tâche planifiée `revision-aliments-nutritrack` (skill `/revision-aliments`, comptes rendus dans `C:\HugoProjects\_bilans\`).

## Git

- Messages de commit en français, une phrase descriptive, suffixe `(seed vN)` quand le seed change.
