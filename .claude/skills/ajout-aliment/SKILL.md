---
name: ajout-aliment
description: Ajoute ou corrige un aliment de base ou une recette de départ de NutriTrack (src/data/seed.ts), avec montée de version du seed, vérification des valeurs, tests et message de commit. À utiliser quand l'utilisateur veut ajouter un aliment ou un produit de marque à la base, corriger des valeurs nutritionnelles, ou créer une recette de départ.
argument-hint: "[aliment ou recette, ex : skyr nature 0 %]"
---

# Ajouter un aliment ou une recette de départ

Demande : $ARGUMENTS

Versions actuelles du seed :
!`grep -nE "export const SEED(_RECIPES)?_VERSION" src/data/seed.ts`

Catégories existantes : Féculents, Protéines, Lipides, Laitiers, Légumes, Fruits, 'Plats & snacks', Suppléments.

## 1. Trouver les valeurs

- Toujours **pour 100 g** (ou 100 ml) : `cal`, `p` protéines, `g` glucides, `l` lipides, `fib` fibres.
- Produit de marque : Open Food Facts, à lire avec WebFetch (API gratuite, sans clé) : `https://world.openfoodfacts.org/api/v2/product/<code-barres>.json` (champ `nutriments`, clés `*_100g`). Renseigner `brand` et `barcode`. Produit générique : table Ciqual. Citer la source dans ta réponse.
- Contrôle rapide : `cal ≈ 4·p + 4·g + 9·l` à 10 % près. Sinon, revérifier avant d'écrire.
- Donnée ambiguë (cru ou cuit, sec ou égoutté, portion inconnue) : demander à l'utilisateur plutôt que deviner.

## 2. Modifier `src/data/seed.ts`

Format d'une ligne (champs optionnels selon le cas) :
`{ name, brand?, barcode?, cal, p, g, l, fib, unit?: 'pcs' | 'ml', pcs?, pcsLabel?, dry?, dryNote?, note?, quickQty? }`

- Aliment compté à la pièce : `unit: 'pcs'`, `pcs` = poids d'une pièce en g, `pcsLabel` (« oeuf », « dose »). `quickQty` est alors un nombre de pièces.
- Pâtes, riz… pesés secs : `dry` = facteur poids cuit / poids sec, `dryNote: 'cuit'`.
- `note` : repères de portion (« 1 c.à.s = 15 g », « 1 pot = 125 g »).
- `quickQty` : deux ou trois portions usuelles.
- Ranger l'aliment dans sa catégorie, à côté des aliments similaires.
- **Incrémenter `SEED_VERSION`.**
- Ne pas renommer un aliment existant sans nécessité : son identifiant change, il disparaît chez l'utilisateur, et les recettes de `SEED_RECIPES` qui le citent doivent être mises à jour.

## 3. Recette de départ (seulement si demandé)

- Ajouter d'abord au seed les aliments manquants.
- Nouvelle entrée dans `SEED_RECIPES` : `id: 'seed-recipe:<slug>'`, `name`, `servings`, et `items` qui citent les aliments par `category` + `food` (nom exact). `qty` en grammes, ou en pièces pour un aliment `pcs`.
- **Incrémenter `SEED_RECIPES_VERSION`** (et `SEED_VERSION` si des aliments ont changé).
- Ajouter un test dans `src/data/__tests__/backup.test.ts`, bloc « recettes de départ », sur le modèle de « Tarte au thon » : nombre d'items et kcal par portion.

## 4. Vérifier

1. Déléguer un contrôle à l'agent `verificateur-nutrition`, en lui donnant la liste exacte des aliments et recettes ajoutés ou modifiés. Corriger ce qu'il signale ou expliquer pourquoi c'est voulu.
2. Lancer `npm run typecheck && npm test` : tout doit passer.

## 5. Conclure

- Résumer : ce qui a été ajouté, les valeurs retenues et leur source, les nouvelles versions du seed.
- Proposer un message de commit dans le style de l'historique :
  - `Base aliments : skyr nature, myrtilles (seed v9)`
  - `Recette de départ « Porridge », flocons d'avoine et skyr (seed v9)`
- Ne commit et ne push que si l'utilisateur le demande : un push lance le build APK.
