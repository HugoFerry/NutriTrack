import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// Fond continu sous toutes les scènes : deux halos aux couleurs du logo qui dérivent lentement.
export const Fond = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;
  const halo = (couleur: string, taille: number, x: number, y: number) => ({
    position: 'absolute' as const,
    width: taille,
    height: taille,
    left: x - taille / 2,
    top: y - taille / 2,
    background: `radial-gradient(circle, ${couleur}, transparent 62%)`,
  });

  return (
    <AbsoluteFill>
      <div style={halo('rgba(46, 224, 139, 0.14)', 1500, interpolate(t, [0, 1], [250, 700]), interpolate(t, [0, 1], [120, 260]))} />
      <div style={halo('rgba(232, 133, 74, 0.10)', 1300, interpolate(t, [0, 1], [1750, 1350]), interpolate(t, [0, 1], [1000, 820]))} />
    </AbsoluteFill>
  );
};
