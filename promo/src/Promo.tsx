import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { Fond } from './Fond';
import { BulleChat } from './scenes/BulleChat';
import { Ecran } from './scenes/Ecran';
import { Logo } from './scenes/Logo';
import { COULEURS, POLICE } from './theme';

export const FPS = 30;
export const DUREE = 30 * FPS;

// Les scènes s'enchaînent sans se chevaucher : chacune s'efface complètement avant la suivante.
// Un fondu enchaîné superposerait le téléphone qui arrive au texte qui part, puisque les scènes alternent de côté.
const SCENES = [
  { debut: 0, duree: 90 },
  { debut: 90, duree: 180 },
  { debut: 270, duree: 180 },
  { debut: 450, duree: 190 },
  { debut: 640, duree: 150 },
  { debut: 790, duree: 110 },
];

const Progression = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        height: 6,
        width: `${(frame / DUREE) * 100}%`,
        background: `linear-gradient(90deg, ${COULEURS.vert}, ${COULEURS.orange})`,
      }}
    />
  );
};

export const Promo = () => {
  const [intro, journal, ajout, chat, suivi, fin] = SCENES;
  return (
    <AbsoluteFill style={{ backgroundColor: COULEURS.fond, fontFamily: POLICE }}>
      <Fond />
      <Sequence from={intro.debut} durationInFrames={intro.duree}>
        <Logo duree={intro.duree} ouverture titre="NutriTrack" sousTitre="Ton suivi nutritionnel, calé sur ta dépense réelle." />
      </Sequence>
      <Sequence from={journal.debut} durationInFrames={journal.duree}>
        <Ecran
          duree={journal.duree}
          image="screenshot-1-journal.png"
          kicker="Journal"
          titre="Chaque repas, en un coup d’œil"
          texte="Calories restantes, protéines, glucides, lipides, fibres et eau : toute ta journée tient sur un écran."
        />
      </Sequence>
      <Sequence from={ajout.debut} durationInFrames={ajout.duree}>
        <Ecran
          duree={ajout.duree}
          inverse
          image="screenshot-2-ajout.png"
          kicker="Saisie rapide"
          titre="Un aliment ajouté en quelques secondes"
          texte="Récents, favoris, recettes, base d’aliments, Open Food Facts et scan du code-barres."
        />
      </Sequence>
      <Sequence from={chat.debut} durationInFrames={chat.duree}>
        <Ecran
          duree={chat.duree}
          image="screenshot-4-chat.png"
          kicker="Chat IA"
          titre="Décris ton repas, le journal se remplit"
          texte="Écris-le ou prends ton assiette en photo : Claude estime les calories et les macros."
        >
          <BulleChat />
        </Ecran>
      </Sequence>
      <Sequence from={suivi.debut} durationInFrames={suivi.duree}>
        <Ecran
          duree={suivi.duree}
          inverse
          image="screenshot-3-suivi.png"
          kicker="Suivi"
          titre="Ta dépense réelle, enfin mesurée"
          texte="Poids lissé sur 7 jours, dépense calculée à partir de ton journal et de tes pesées, bilan de la semaine."
        />
      </Sequence>
      <Sequence from={fin.debut} durationInFrames={fin.duree}>
        <Logo duree={fin.duree} titre="Tes données restent sur ton téléphone." sousTitre="Sans compte ni serveur · NutriTrack pour Android" />
      </Sequence>
      <Progression />
    </AbsoluteFill>
  );
};
