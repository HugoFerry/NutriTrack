# NutriTrack

Application personnelle de suivi nutritionnel (Android, hors store). Local-first : toutes les données restent sur le téléphone, avec export / import JSON pour changer d'appareil.

## Fonctionnalités

- **Journal** par jour et par repas, navigation calendrier, copie d'hier, eau, fibres, jour entraînement / repos.
- **Saisie rapide** : récents, favoris, recherche locale (+ de 90 aliments de base), Open Food Facts (recherche + scan de code-barres), aliments perso, recettes.
- **Chat IA** (Claude) : décris ce que tu as mangé ou envoie une photo, les aliments sont ajoutés au journal. L'IA réutilise tes aliments et recettes ; un produit nouveau devient un aliment perso « à vérifier », cherchable ensuite sans repasser par le chat. Questions et conseils avec le contexte du jour.
- **Suivi** : courbe de poids avec moyenne 7 jours, TDEE mesuré (régression sur apport et poids, sans la journée en cours ni les journées incomplètes), bilan hebdo, adhérence, cyclage des glucides, projection vers le poids objectif.
- **Santé** : pas, calories actives, séances et pesées importés de Health Connect (Samsung Health, Google Fit, Garmin…). Une séance marque automatiquement le jour comme entraînement.
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

### Sans APK : Play Console en test interne (téléphone géré par une entreprise)

Si le téléphone a un profil professionnel qui bloque l'installation d'APK et le débogage USB, la voie officielle est le Play Store via la piste **Tests internes** : distribution privée à des adresses Gmail invitées, sans validation publique, mises à jour automatiques.

**Préparation (une fois)**

1. Configurer les secrets de signature ci-dessus. Le workflow produit alors, en plus de l'APK, l'artefact `NutriTrack-release-aab`. Le `versionCode` est incrémenté automatiquement à chaque run (Play exige qu'il augmente).
2. Publier la politique de confidentialité : Settings › Pages du dépôt, source *Deploy from a branch*, branche `main`, dossier `/docs`. L'URL sera `https://hugoferry.github.io/NutriTrack/privacy.html`.
3. Créer un compte développeur sur play.google.com/console (frais uniques, vérification d'identité sous quelques jours).

**Dans la Play Console**

1. *Créer une application* : nom NutriTrack, langue français, type Application, gratuite.
2. *Tests › Tests internes › Créer une release* : envoyer le `.aab`. À la première release, accepter la signature d'application par Google Play : le keystore de la CI devient la clé d'upload.
3. *Testeurs* : créer une liste avec ton adresse Gmail, enregistrer, copier le lien d'invitation.
4. *Contenu de l'application* : politique de confidentialité (URL ci-dessus), sécurité des données, déclaration Health Connect, classification du contenu, public cible. Les réponses sont prêtes dans `store/listing.md`, les images dans `store/`.
5. Sur le téléphone : ouvrir le lien d'invitation avec le compte Gmail invité, accepter, installer depuis le Play Store.

Chaque nouveau run vert donne un nouveau `.aab` à envoyer dans *Tests internes*. Le téléphone reçoit la mise à jour comme n'importe quelle app.

## Samsung Health / Health Connect

NutriTrack ne parle pas directement à Samsung Health (API réservée aux partenaires) mais lit **Health Connect**, où Samsung Health dépose ses données. À faire une fois sur le téléphone :

1. Samsung Health › Réglages › Health Connect › activer la synchronisation et autoriser pas, exercice, calories, poids.
2. NutriTrack › Profil › Santé › *Lier Health Connect* et accepter les permissions.

La synchronisation se fait à chaque ouverture de l'app (30 derniers jours). Les calories actives sont affichées mais n'entrent pas dans la cible : le TDEE mesuré capte déjà la dépense réelle.

## Clé API Anthropic

Le chat IA appelle directement l'API Anthropic depuis l'app. La clé se saisit dans *Profil › Chat IA & clé API* ; elle est stockée sur l'appareil et incluse dans les sauvegardes. Modèle par défaut : Claude Opus 5 (Sonnet 5 et Haiku 4.5 disponibles pour réduire le coût).

## Changer de téléphone

*Profil › Sauvegarde & transfert › Exporter* : le fichier JSON contient tout (journal, pesées, aliments perso, recettes, réglages, clé API). Sur le nouveau téléphone : installer l'APK, *Importer › Remplacer tout*.

## Icône et écran de démarrage

Les sources sont dans `assets/` (SVG + PNG 1024). Pour régénérer les ressources Android après modification :

```bash
node -e "const s=require('sharp');s('assets/icon-foreground.svg').resize(1024,1024).png().toFile('assets/icon-foreground.png');s('assets/splash.svg').resize(2732,2732).png().toFile('assets/splash.png')"
npx @capacitor/assets generate --android --iconBackgroundColor '#0F2E1D' --iconBackgroundColorDark '#0F2E1D' --splashBackgroundColor '#0C0F14' --splashBackgroundColorDark '#0C0F14'
```

## Version web (artefact Claude)

Une cible de build produit la même app sous forme de page hébergée sur claude.ai, sans APK :

```bash
npm run build:artifact   # → dist-artifact/nutritrack.html + dist-artifact/assets/, à publier avec l'outil Artifact
```

Différences avec l'APK : les données sont synchronisées dans le stockage de l'artefact (accessibles depuis tous tes appareils, fusion par ligne « la plus récente gagne »), le chat IA passe par l'abonnement Claude du visiteur (pas de clé API), l'export utilise le téléchargement de la plateforme. Pas d'Open Food Facts, de scanner, de Health Connect ni de rappels dans cette version.
