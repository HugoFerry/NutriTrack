---
name: publier-artefact
description: Republie la version web de NutriTrack (artefact Claude) à partir du code du dépôt, et pousse sur GitHub si c'est demandé. Vérifie, construit, publie à la même adresse en retirant les anciens fichiers, contrôle le résultat. À utiliser seulement quand l'utilisateur demande explicitement de publier ou de republier (« publie », « republie », « publie et pousse ») ; « simulation » vérifie et construit sans rien publier ni pousser.
argument-hint: "[pousse | simulation] [changement en quelques mots]"
allowed-tools: Read Bash(npm run *) Bash(npm test) Bash(git status *) Bash(git log *) Bash(git push origin main) Bash(node *)
---

# Republier l'artefact NutriTrack

Demande : $ARGUMENTS

Artefact : https://claude.ai/artifact/7kcJN1VkJTQhffZWvLmcma (épinglé ; capacités `db`, `downloads`, `sample`).

État du dépôt :
!`git status --short`
!`git log --oneline -3`

Publier n'a lieu que sur demande explicite de l'utilisateur ; pousser, seulement si la demande le dit (« pousse »), car chaque push lance le build de l'APK. Avec « simulation », s'arrêter après l'étape 3.

## 1. Vérifier

- Le code publié doit être celui du dépôt. S'il reste des modifications non commitées (hors `.claude/launch.json`), le signaler et demander s'il faut publier quand même.
- Lancer `npm run typecheck && npm test`. Si quelque chose échoue, s'arrêter là.

## 2. Construire

`npm run build:artifact` produit :
- `dist-artifact/nutritrack.html`, la page ;
- `dist-artifact/files.json`, la liste des fichiers `assets/…` à publier.

## 3. Préparer la liste des fichiers

1. Relire l'artefact avec `Artifact` (`action: read`, URL ci-dessus), sauf s'il a déjà été publié ou lu dans cette conversation : c'est obligatoire avant de mettre à jour un artefact publié depuis une autre conversation.
2. Lister ses fichiers (`action: list`, `scope: files`).
3. Calculer la carte `files` en passant au script les chemins listés :

   ```
   node .claude/skills/publier-artefact/scripts/carte-fichiers.mjs <chemins publiés…>
   ```

   Elle contient chaque entrée de `files.json`, plus `null` pour chaque ancien fichier `assets/…` qui n'en fait plus partie : sans ce `null`, les anciens fichiers resteraient en ligne, orphelins.

En simulation, montrer la carte et s'arrêter ici.

## 4. Publier et contrôler

1. Publier (`action: publish`) avec :
   - `url` : l'URL ci-dessus. On garde toujours la même adresse, jamais de nouvel artefact ;
   - `file_path` : `dist-artifact/nutritrack.html`, et `root` : `dist-artifact` ;
   - `files` : la carte de l'étape 3 ;
   - `label` : le changement, en quelques mots.

   Ne pas passer `capabilities`, `icon` ni `contract` : ils sont conservés tels quels.
2. Contrôler :
   - relister les fichiers : il doit y avoir exactement ceux de `files.json`, plus `index.html` ;
   - lire `index.html` publié (`path: index.html`) : il doit pointer vers le nouveau `assets/index-….js`.

## 5. Pousser (seulement si c'est demandé)

`git push origin main`. La CI construit l'APK (`.github/workflows/android.yml`) : ne pas la surveiller en boucle, une seule vérification plus tard suffit si l'utilisateur la demande.

## 6. Conclure

- Donner le numéro de version publié et, s'il y a eu push, le commit poussé.
- Rappeler de recharger la page de l'artefact sur chaque appareil.
- Si la publication rend possible une écriture dans la base de l'artefact qui attendait la nouvelle version (séance type, aliments), la faire maintenant, avec `updatedAt` = maintenant.
