# NutriTrack

Application personnelle de suivi nutritionnel (Android, hors store). Local-first : toutes les données restent sur le téléphone, avec export / import JSON pour changer d'appareil.

## Fonctionnalités

- **Journal** par jour et par repas, navigation calendrier, copie d'hier, eau, fibres, jour entraînement / repos.
- **Saisie rapide** : récents, favoris, recherche locale (+ de 90 aliments de base), Open Food Facts (recherche + scan de code-barres), aliments perso, recettes.
- **Chat IA** (Claude) : décris ce que tu as mangé ou envoie une photo, les aliments sont ajoutés au journal. Questions et conseils avec le contexte du jour.
- **Suivi** : courbe de poids avec moyenne 7 jours, TDEE mesuré (régression sur apport et poids), bilan hebdo, adhérence, cyclage des glucides, projection vers le poids objectif.
- **Rappels** pesée du matin et journal du soir (Android).
- **Sauvegarde** : export / import complet (remplacer ou fusionner).

## Architecture

```
src/
  domain/     calculs purs, testés (BMR, TDEE, cibles, TDEE adaptatif, stats, suggestions)
  data/       Dexie (IndexedDB) : schéma, seed aliments, dépôts, sauvegarde
  services/   Anthropic (chat + vision), Open Food Facts, scanner, notifications, plateforme
  ui/         React : composants, hooks (live queries), écrans
android/      projet Capacitor (généré, versionné)
```

Stack : Vite + React + TypeScript, Capacitor 8, Dexie, Anthropic SDK, Vitest.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173 (tout marche dans le navigateur sauf scan et rappels)
npm test           # tests unitaires
npm run typecheck
```

## Obtenir l'APK

### Via GitHub Actions (recommandé, rien à installer)

Chaque push lance le workflow **Build Android APK**. Ouvre l'onglet *Actions* du dépôt, choisis le dernier run, et télécharge l'artefact `NutriTrack-*-apk`. Installe le fichier sur le téléphone (autoriser « sources inconnues » pour le navigateur ou le gestionnaire de fichiers).

**Signature stable (important pour mettre à jour sans désinstaller)** : sans secret, la CI produit un APK *debug* signé avec une clé différente à chaque run, et Android refusera d'installer une mise à jour par-dessus l'ancienne version. Pour avoir une clé fixe :

```bash
keytool -genkeypair -v -keystore nutritrack.keystore -alias nutritrack -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 nutritrack.keystore   # Linux ; sur macOS : base64 -i nutritrack.keystore
```

Puis dans *Settings › Secrets and variables › Actions* du dépôt, ajoute :

| Secret | Valeur |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | la sortie du `base64` |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du keystore |
| `ANDROID_KEY_ALIAS` | `nutritrack` |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé (souvent le même) |

Le workflow bascule alors en build *release* signé. Garde le fichier keystore précieusement : sans lui, impossible de mettre à jour l'app installée.

### En local

Prérequis : JDK 21, Android SDK (platform 36, build-tools 36). Puis :

```bash
npm run android:debug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

## Clé API Anthropic

Le chat IA appelle directement l'API Anthropic depuis l'app. La clé se saisit dans *Profil › Chat IA & clé API* ; elle est stockée sur l'appareil et incluse dans les sauvegardes. Modèle par défaut : Claude Opus 5 (Sonnet 5 et Haiku 4.5 disponibles pour réduire le coût).

## Changer de téléphone

*Profil › Sauvegarde & transfert › Exporter* : le fichier JSON contient tout (journal, pesées, aliments perso, recettes, réglages, clé API). Sur le nouveau téléphone : installer l'APK, *Importer › Remplacer tout*.
