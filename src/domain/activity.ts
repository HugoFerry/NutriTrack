import type { Commute, Treadmill, WorkoutExtras } from './types';
import { fmtQty } from './foods';

/**
 * Activité autour d'une séance : trajet jusqu'à la salle et tapis incliné après la séance.
 * Estimations « nettes » (au-delà de la dépense de repos) à partir des équivalents métaboliques (MET) :
 * kcal ≈ (MET − 1) × poids (kg) × heures. Elles servent au suivi et au coach, jamais à la cible du jour :
 * la dépense mesurée (ou le niveau d'activité du profil) les contient déjà.
 */

/** Trajet habituel, aller simple : 6 km à vélo en 16 min environ. */
export const DEFAULT_COMMUTE: Commute = { mode: 'velo', km: 6, minutes: 16 };
export const DEFAULT_TREADMILL: Treadmill = { minutes: 20, inclinePct: 10, speedKmh: 5 };

export const COMMUTE_FR: Record<Commute['mode'], string> = { velo: 'vélo', marche: 'à pied' };

/** Aller-retour à partir du trajet habituel (aller simple). */
export function roundTrip(c: Commute): Commute {
  return { mode: c.mode, km: c.km * 2, minutes: c.minutes * 2 };
}

const speed = (km: number, minutes: number) => (minutes > 0 ? km / (minutes / 60) : 0);

/** Compendium des activités physiques : vélo de déplacement selon la vitesse, plafonné (feux, arrêts). */
function bikeMet(kmh: number): number {
  if (kmh < 16) return 4;
  if (kmh < 19.3) return 6.8;
  return 8;
}

/** Compendium : marche sur le plat selon la vitesse (5 km/h si inconnue). */
function walkMet(kmh: number): number {
  const v = kmh || 5;
  if (v < 3.5) return 2.8;
  if (v < 4.5) return 3;
  if (v < 5.3) return 3.5;
  if (v < 6) return 4.3;
  if (v < 6.8) return 5;
  return 7;
}

/** Équation de marche de l'ACSM (valable de 3 à 6 km/h) : VO2 = 0,1·v + 1,8·v·pente + 3,5 (v en m/min). */
function inclineWalkMet(kmh: number, inclinePct: number): number {
  const v = (kmh * 1000) / 60;
  return (0.1 * v + 1.8 * v * (inclinePct / 100) + 3.5) / 3.5;
}

const netKcal = (met: number, weightKg: number, minutes: number) => Math.max(0, Math.round((met - 1) * weightKg * (minutes / 60)));

export function commuteKcal(c: Commute, weightKg: number): number {
  const kmh = speed(c.km, c.minutes);
  return netKcal(c.mode === 'velo' ? bikeMet(kmh) : walkMet(kmh), weightKg, c.minutes);
}

export function treadmillKcal(t: Treadmill, weightKg: number): number {
  return netKcal(inclineWalkMet(t.speedKmh, t.inclinePct), weightKg, t.minutes);
}

export function extrasKcal(e: WorkoutExtras | undefined, weightKg: number): number {
  if (!e) return 0;
  return (e.commute ? commuteKcal(e.commute, weightKg) : 0) + (e.treadmill ? treadmillKcal(e.treadmill, weightKg) : 0);
}

/** Habitude décrite au coach, avec la règle de calcul : ces calories ne s'ajoutent pas à la cible. */
export function commuteHabit(c: Commute): string {
  return `Il va à la salle ${c.mode === 'velo' ? 'à vélo' : 'à pied'} (${fmtQty(c.km)} km et environ ${c.minutes} min par trajet, aller et retour), et fait souvent 15 à 30 min de tapis incliné après la séance ; les deux sont notés avec chaque séance. `
    + "Leurs calories (estimées) sont déjà comprises dans sa dépense, mesurée ou donnée par son niveau d'activité : l'app ne les ajoute pas à sa cible, et tu ne dois pas lui conseiller de les « remanger ».";
}

/** « vélo 12 km (32 min) · tapis 20 min à 10 % », pour les résumés et le coach. */
export function extrasText(e: WorkoutExtras | undefined): string {
  if (!e) return '';
  const parts = [
    e.commute ? `${COMMUTE_FR[e.commute.mode]} ${fmtQty(e.commute.km)} km (${e.commute.minutes} min)` : null,
    e.treadmill ? `tapis incliné ${e.treadmill.minutes} min à ${fmtQty(e.treadmill.inclinePct)} %, ${fmtQty(e.treadmill.speedKmh)} km/h` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}
