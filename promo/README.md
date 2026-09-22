# Vidéo de présentation de NutriTrack

Une vidéo de 30 secondes en 1920 × 1080, écrite en React avec [Remotion](https://www.remotion.dev). Les images viennent directement du dossier `../store` (captures de la fiche Play Store).

## Commandes

```bash
npm install
npm run studio    # aperçu interactif dans le navigateur, avec une timeline
npm run render    # vidéo finale : out/nutritrack-promo.mp4
npm run apercu    # une seule image (la 150e) : out/apercu.png
npm run typecheck
```

## Structure

| Fichier | Rôle |
|---|---|
| `src/Promo.tsx` | Le découpage : l'ordre des scènes, leurs durées et leurs textes |
| `src/scenes/Logo.tsx` | Ouverture et clôture autour du logo |
| `src/scenes/Ecran.tsx` | Une fonctionnalité : capture dans un téléphone, et texte qui apparaît par étapes |
| `src/scenes/BulleChat.tsx` | Le message qui s'écrit en direct, puis la confirmation de l'assistant |
| `src/Fond.tsx`, `src/Telephone.tsx`, `src/theme.ts` | Fond animé, cadre du téléphone, couleurs et police |

La vidéo tourne à 30 images par seconde : 30 images font une seconde dans les durées de `Promo.tsx`.

## Pour la modifier

- **Changer un texte** : dans `src/Promo.tsx`.
- **Changer une durée** : le tableau `SCENES` de `src/Promo.tsx`. Chaque scène commence là où la précédente finit, et s'efface complètement avant la suivante : un fondu enchaîné superposerait les éléments, puisque les scènes alternent de côté.
- **Ajouter une musique** : placer le fichier dans `../store` (ou changer `setPublicDir` dans `remotion.config.ts`), puis ajouter `<Audio src={staticFile('musique.mp3')} />` dans `Promo`.
- **Le Play Store** attend un lien YouTube, pas un fichier : il faut d'abord mettre la vidéo en ligne sur YouTube.
