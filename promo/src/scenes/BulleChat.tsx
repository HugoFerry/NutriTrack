import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BORNE, COULEURS } from '../theme';

const MESSAGE = "J'ai mangé 2 oeufs et 80 g de pâtes avec 150 g de poulet";
// Valeurs de la base d'aliments de NutriTrack : 2 oeufs (186), 80 g de pâtes sèches (280), 150 g de blanc de poulet (248).
const REPONSE = '✓  3 aliments ajoutés au journal · 714 kcal';

// Un message qui s'écrit en direct, puis la confirmation de l'assistant.
export const BulleChat = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const debut = 40;
  const fin = debut + 55;
  const lettres = Math.round(interpolate(frame, [debut, fin], [0, MESSAGE.length], BORNE));
  const curseurVisible = frame < fin + 10 && Math.floor(frame / 8) % 2 === 0;
  const confirmation = spring({ frame: frame - (fin + 12), fps, config: { damping: 14, stiffness: 160 } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 12, alignItems: 'flex-start' }}>
      <div
        style={{
          background: COULEURS.carte,
          border: `2px solid ${COULEURS.bord}`,
          borderRadius: 28,
          padding: '22px 30px',
          color: COULEURS.texte,
          fontSize: 32,
          minHeight: 44,
          maxWidth: 820,
        }}
      >
        {MESSAGE.slice(0, lettres)}
        <span style={{ opacity: curseurVisible ? 1 : 0, color: COULEURS.vert }}>|</span>
      </div>
      <div
        style={{
          opacity: confirmation,
          transform: `scale(${interpolate(confirmation, [0, 1], [0.8, 1])})`,
          transformOrigin: 'left center',
          background: 'rgba(46, 224, 139, 0.14)',
          border: `2px solid ${COULEURS.vert}`,
          borderRadius: 999,
          padding: '14px 28px',
          color: COULEURS.vert,
          fontSize: 30,
          fontWeight: 600,
        }}
      >
        {REPONSE}
      </div>
    </div>
  );
};
