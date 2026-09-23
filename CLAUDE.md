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

- `src/domain/` : calculs purs et testés (BMR, TDEE, TDEE adaptatif, cibles, suggestions, rapprochement des réponses du chat IA avec la base dans `aiFoods.ts`). Aucune dépendance à Dexie ni à React.
- `src/data/` : Dexie (IndexedDB). Schéma `db.ts`, aliments et recettes de départ `seed.ts`, dépôts `repos.ts`, sauvegarde `backup.ts`, synchro de la version artefact `sync.ts`.
- `src/services/` : Anthropic (chat + vision, `ai.ts`), Open Food Facts, scanner, notifications, plateforme (`platform.ts` : APK, artefact ou navigateur).
- `src/ui/` : React, avec `screens/`, `components/` et `hooks/` (live queries Dexie).
- `android/` : projet Capacitor généré, versionné.

## Règles

- Valeurs nutritionnelles pour 100 g (ou 100 ml) : `cal`, `p` protéines, `g` glucides, `l` lipides, `fib` fibres.
- Modifier les aliments de base (`S` dans `src/data/seed.ts`) impose d'incrémenter `SEED_VERSION` ; modifier `SEED_RECIPES` impose d'incrémenter `SEED_RECIPES_VERSION`. Sans ça, les appareils déjà installés ne voient pas le changement. Procédure complète : skill `/ajout-aliment`.
- Renommer un aliment de base change son identifiant (`seedId(catégorie, nom)`) : il disparaît chez l'utilisateur et les recettes qui le citent doivent suivre.
- Toute fonctionnalité doit se dégrader proprement dans la version artefact (pas d'Open Food Facts, de scanner, de Health Connect ni de rappels) : passer par `services/platform.ts` et `services/artifact.ts`.
- Pas de backend : les données ne quittent l'appareil que par l'export JSON ou par l'API Anthropic (clé saisie par l'utilisateur).
- Chaque push sur GitHub lance le build APK (`.github/workflows/android.yml`) : ne pas pousser sans demande explicite.

## Git

- Messages de commit en français, une phrase descriptive, suffixe `(seed vN)` quand le seed change.
