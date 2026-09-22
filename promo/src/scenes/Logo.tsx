import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BORNE, COULEURS } from '../theme';

interface Props {
  duree: number;
  titre: string;
  sousTitre: string;
  // En ouverture, le logo arrive d'un peu plus loin et la scène s'efface à la fin ; en clôture, elle reste affichée.
  ouverture?: boolean;
}

// Scène centrée autour du logo : ouverture et clôture de la vidéo.
export const Logo = ({ duree, titre, sousTitre, ouverture = false }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const texte = spring({ frame: frame - 12, fps, config: { damping: 200 }, durationInFrames: 24 });
  const sous = spring({ frame: frame - 24, fps, config: { damping: 200 }, durationInFrames: 24 });
  const sortie = ouverture ? interpolate(frame, [duree - 12, duree - 1], [1, 0], BORNE) : 1;
  const monte = (p: number) => ({ opacity: p, transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)` });

  return (
    <AbsoluteFill style={{ opacity: sortie, alignItems: 'center', justifyContent: 'center', gap: 34, flexDirection: 'column' }}>
      <Img
        src={staticFile('icon-512.png')}
        style={{
          width: ouverture ? 230 : 180,
          height: ouverture ? 230 : 180,
          borderRadius: ouverture ? 52 : 40,
          opacity: interpolate(logo, [0, 0.3], [0, 1], BORNE),
          transform: `scale(${interpolate(logo, [0, 1], [ouverture ? 0.5 : 0.8, 1])})`,
          boxShadow: '0 30px 90px rgba(46, 224, 139, 0.25)',
        }}
      />
      <div style={{ ...monte(texte), color: COULEURS.texte, fontSize: ouverture ? 104 : 72, fontWeight: 700, letterSpacing: -1, textAlign: 'center' }}>{titre}</div>
      <div style={{ ...monte(sous), color: COULEURS.attenue, fontSize: 40, textAlign: 'center', maxWidth: 1300 }}>{sousTitre}</div>
    </AbsoluteFill>
  );
};
