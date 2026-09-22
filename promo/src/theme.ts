import type { InterpolateOptions } from 'remotion';

// Couleurs reprises de l'app et du logo (assets/icon.svg).
export const COULEURS = {
  fond: '#0A0D12',
  carte: '#151A22',
  bord: '#262E3B',
  texte: '#F1F3F6',
  attenue: '#8A93A3',
  vert: '#2EE08B',
  orange: '#E8854A',
};

export const POLICE = "'Segoe UI', 'Inter', system-ui, sans-serif";

export const BORNE: InterpolateOptions = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
