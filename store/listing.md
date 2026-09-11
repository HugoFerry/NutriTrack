# Fiche Play Store (piste Tests internes)

Textes prêts à coller dans la Play Console. Les images sont dans ce dossier :
`icon-512.png` (icône 512×512), `feature-graphic.png` (bannière 1024×500), `screenshot-*.png` (téléphone 1080×2340).

## Nom
NutriTrack

## Description courte (80 car. max)
Suivi nutritionnel personnel : journal, TDEE mesuré, chat IA, Health Connect.

## Description complète
NutriTrack est une application personnelle de suivi nutritionnel, sans compte ni serveur : toutes les données restent sur le téléphone.

• Journal par repas avec base d'aliments, Open Food Facts et scan de code-barres
• Recettes, favoris, aliments perso, copie de la veille
• Cibles calculées (BMR, TDEE, macros) puis ajustées par la dépense réellement mesurée
• Courbe de poids lissée, bilan hebdomadaire, cyclage des glucides
• Assistant IA (clé API personnelle) : décris un repas ou envoie une photo, il remplit le journal
• Pas, séances et pesées importés depuis Health Connect (Samsung Health, etc.)
• Sauvegarde et restauration complètes pour changer de téléphone

Application distribuée uniquement à des testeurs invités.

## Catégorie
Santé et remise en forme

## Politique de confidentialité
URL de la page `docs/privacy.html` publiée via GitHub Pages (voir README).

## Sécurité des données (formulaire « Data safety »)
- L'app collecte-t-elle ou partage-t-elle des données utilisateur ? **Oui** (envoi vers des services tiers à la demande de l'utilisateur).
- Données chiffrées en transit : **Oui** (HTTPS).
- L'utilisateur peut demander la suppression : **Oui** (réinitialisation / désinstallation, tout est local).
- Types de données :
  - **Santé et remise en forme › Infos sur la santé** : collectées (Health Connect), traitées sur l'appareil, non partagées. Facultatif. Finalité : fonctionnalités de l'app.
  - **Santé et remise en forme › Infos sur la condition physique** : idem.
  - **Photos et vidéos › Photos** : partagées avec Anthropic (assistant IA) à la demande de l'utilisateur, non collectées par l'éditeur. Facultatif. Finalité : fonctionnalités de l'app.
  - **Messages › Autres messages intégrés à l'application** (texte du chat) : partagés avec Anthropic, à la demande. Facultatif.
- Aucune donnée n'est utilisée pour la publicité ou l'analyse.

## Déclaration Health Connect (« App content » › Health Connect)
Types lus : pas, calories actives, sessions d'exercice, poids.
Justification : afficher l'activité du jour, identifier les jours d'entraînement pour adapter les glucides, compléter la courbe de poids. Traitement local uniquement, aucune transmission. L'utilisateur active la liaison depuis Profil › Santé et peut révoquer les permissions à tout moment.
