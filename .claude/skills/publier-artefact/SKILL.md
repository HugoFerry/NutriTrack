---
name: publier-artefact
description: Republie la version web de NutriTrack (artefact Claude) à partir du code du dépôt. Vérifie, construit, publie à la même adresse en retirant les anciens fichiers, puis contrôle le résultat. À lancer quand l'utilisateur veut que l'artefact profite d'un changement de l'app ou du seed.
argument-hint: "[changement en quelques mots, ex : seed v9]"
disable-model-invocation: true
allowed-tools: Read Bash(npm run *) Bash(git status *) Bash(git log *) Bash(node *)
---

# Republier l'artefact NutriTrack

Demande : $ARGUMENTS

Artefact : https://claude.ai/artifact/7kcJN1VkJTQhffZWvLmcma (épinglé ; capacités `db`, `downloads`, `sample`).

État du dépôt :
!`git status --short`
!`git log --oneline -3`

## 1. Vérifier

- Le code publié doit être celui du dépôt. S'il reste des modifications non commitées, le signaler et demander s'il faut publier quand même.
- Lancer `npm run typecheck && npm test`. Si quelque chose échoue, s'arrêter là.

## 2. Construire

`npm run build:artifact` produit :
- `dist-artifact/nutritrack.html`, la page ;
- `dist-artifact/files.json`, la liste des fichiers `assets/…` à publier.

## 3. Publier

1. Relire l'artefact avec `Artifact` (`action: read`, URL ci-dessus). C'est obligatoire avant de mettre à jour un artefact publié depuis une autre conversation.
2. Lister ses fichiers (`action: list`, `scope: files`).
3. Publier (`action: publish`) avec :
   - `url` : l'URL ci-dessus. On garde toujours la même adresse, jamais de nouvel artefact ;
   - `file_path` : `dist-artifact/nutritrack.html`, et `root` : `dist-artifact` ;
   - `files` : chaque entrée de `files.json`, plus `null` pour chaque ancien fichier `assets/…` absent de `files.json`. Sans ce `null`, les anciens fichiers restent en ligne, orphelins ;
   - `label` : la demande, en quelques mots.

   Ne pas passer `capabilities`, `icon` ni `contract` : ils sont conservés tels quels.
4. Contrôler :
   - relister les fichiers : il doit y avoir exactement ceux de `files.json`, plus `index.html` ;
   - lire `index.html` publié : il doit pointer vers le nouveau `assets/index-….js`.

## 4. Conclure

- Donner le numéro de version publié et rappeler de recharger la page de l'artefact sur chaque appareil.
- L'APK n'est pas concerné : il se construit sur GitHub à chaque push.
