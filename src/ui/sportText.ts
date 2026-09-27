import type { Exercise } from '../domain/types';

// Libellés de l'écran Sport et de ses éditeurs.

export type ExMap = Map<string, Exercise>;
export const exName = (m: ExMap, id: string) => m.get(id)?.name ?? id;
export const restLabel = (sec?: number) => (!sec ? '' : sec % 60 ? `${Math.floor(sec / 60)} min ${sec % 60}` : `${sec / 60} min`);
export const setsLabel = (n: number, target?: string) => (target ? `${n} × ${target}` : `${n} série${n > 1 ? 's' : ''}`);
