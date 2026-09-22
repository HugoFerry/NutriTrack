import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Telephone } from '../Telephone';
import { BORNE, COULEURS } from '../theme';

interface Props {
  duree: number;
  image: string;
  kicker: string;
  titre: string;
  texte: string;
  // Téléphone à gauche et texte à droite, pour alterner d'une scène à l'autre.
  inverse?: boolean;
  children?: ReactNode;
}

// Une fonctionnalité : une capture dans un téléphone, et son texte qui apparaît par étapes.
export const Ecran = ({ duree, image, kicker, titre, texte, inverse = false, children }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const apparition = (retard: number) => spring({ frame: frame - retard, fps, config: { damping: 200 }, durationInFrames: 26 });
  const sortie = interpolate(frame, [duree - 12, duree - 1], [1, 0], BORNE);

  const tel = apparition(0);
  const inclinaison = inverse ? -1 : 1;
  const telephone = {
    opacity: tel,
    transform: `translateY(${interpolate(tel, [0, 1], [140, interpolate(frame, [0, duree], [0, -24])])}px) rotate(${interpolate(tel, [0, 1], [5, 1.5]) * inclinaison}deg)`,
  };
  const ligne = (retard: number) => {
    const p = apparition(retard);
    return { opacity: p, transform: `translateX(${interpolate(p, [0, 1], [inverse ? 50 : -50, 0])}px)` };
  };

  return (
    <AbsoluteFill style={{ opacity: sortie }}>
      <div style={{ position: 'absolute', left: inverse ? 230 : 1240, top: 96 }}>
        <Telephone image={image} style={telephone} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: inverse ? 790 : 170,
          top: 0,
          bottom: 0,
          width: 900,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        <div style={{ ...ligne(8), color: COULEURS.vert, fontSize: 30, fontWeight: 600, letterSpacing: 6, textTransform: 'uppercase' }}>{kicker}</div>
        <div style={{ ...ligne(14), color: COULEURS.texte, fontSize: 78, fontWeight: 700, lineHeight: 1.08 }}>{titre}</div>
        <div style={{ ...ligne(22), color: COULEURS.attenue, fontSize: 36, lineHeight: 1.45, maxWidth: 820 }}>{texte}</div>
        {children ? <div style={ligne(34)}>{children}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
