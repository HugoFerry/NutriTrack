import type { CSSProperties } from 'react';
import { Img, staticFile } from 'remotion';
import { COULEURS } from './theme';

// Cadre de téléphone autour d'une capture d'écran de l'app (1080 × 2340).
export const Telephone = ({ image, style }: { image: string; style?: CSSProperties }) => (
  <div
    style={{
      width: 426,
      height: 888,
      padding: 14,
      borderRadius: 60,
      background: '#05070A',
      border: `2px solid ${COULEURS.bord}`,
      boxShadow: '0 40px 120px rgba(0, 0, 0, 0.65), 0 0 90px rgba(46, 224, 139, 0.12)',
      ...style,
    }}
  >
    <Img src={staticFile(image)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 46, display: 'block' }} />
  </div>
);
