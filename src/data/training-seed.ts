import type { Exercise, Program, ProgramBlock } from '../domain/types';

/**
 * Catalogue d'exercices de départ et programme d'Hugo (Les Coachs du Bassin), transcrit des fiches.
 * Modifier le catalogue impose d'incrémenter SEED_TRAINING_VERSION : sans ça, les appareils déjà
 * installés ne voient pas le changement. Le programme, lui, est réappliqué à chaque démarrage
 * (ensureSeedPrograms dans db.ts) ; une séance type modifiée dans l'app (source « custom ») n'est
 * jamais réécrite.
 *
 * v2 : hip thrust à la place de la presse (Jambes), superset curl marteau + curl incliné (Dos),
 * exercices courants ajoutés au catalogue.
 * v3 : haltères au front à la place de la barre au front (Bras), superset extension triceps poulie + curl haltères.
 */
export const SEED_TRAINING_VERSION = 3;

type SeedExercise = Omit<Exercise, 'id' | 'source'> & { slug: string };

const EX: SeedExercise[] = [
  // Dos
  { slug: 'tractions', name: 'Tractions', kind: 'pdc', groups: ['dos', 'biceps'] },
  { slug: 'tractions-supination', name: 'Tractions supination', kind: 'pdc', groups: ['dos', 'biceps'] },
  { slug: 'rowing-bucheron', name: 'Rowing bûcheron', kind: 'charge', groups: ['dos'], perSide: true },
  { slug: 'tirage-horizontal', name: 'Tirage horizontal', kind: 'charge', groups: ['dos'] },
  { slug: 'pull-over-poulie', name: 'Pull over poulie', kind: 'charge', groups: ['dos'] },
  { slug: 'tirage-vertical', name: 'Tirage vertical', kind: 'charge', groups: ['dos', 'biceps'] },
  { slug: 'rowing-barre', name: 'Rowing barre', kind: 'charge', groups: ['dos'] },
  { slug: 'souleve-de-terre', name: 'Soulevé de terre', kind: 'charge', groups: ['dos', 'jambes'] },
  { slug: 'face-pull', name: 'Face pull', kind: 'charge', groups: ['epaules', 'dos'] },
  // Pecs
  { slug: 'developpe-couche-halteres', name: 'Développé couché haltères', kind: 'charge', groups: ['pecs', 'triceps', 'epaules'] },
  { slug: 'developpe-incline-smith', name: 'Développé incliné Smith', kind: 'charge', groups: ['pecs', 'epaules', 'triceps'] },
  { slug: 'dips', name: 'Dips', kind: 'pdc', groups: ['pecs', 'triceps'] },
  { slug: 'ecarte-poulie-basse', name: 'Écarté poulie basse', kind: 'charge', groups: ['pecs'] },
  { slug: 'pull-over-haltere', name: 'Pull over haltère sur banc', kind: 'charge', groups: ['pecs', 'dos'] },
  { slug: 'developpe-couche-barre', name: 'Développé couché barre', kind: 'charge', groups: ['pecs', 'triceps', 'epaules'] },
  { slug: 'developpe-incline-halteres', name: 'Développé incliné haltères', kind: 'charge', groups: ['pecs', 'epaules', 'triceps'] },
  { slug: 'ecarte-halteres', name: 'Écarté haltères', kind: 'charge', groups: ['pecs'] },
  { slug: 'pec-deck', name: 'Pec deck', kind: 'charge', groups: ['pecs'] },
  { slug: 'pompes', name: 'Pompes', kind: 'pdc', groups: ['pecs', 'triceps'] },
  // Épaules et bras
  { slug: 'developpe-militaire-assis', name: 'Développé militaire assis', kind: 'charge', groups: ['epaules', 'triceps'] },
  { slug: 'elevations-laterales', name: 'Élévations latérales', kind: 'charge', groups: ['epaules'] },
  { slug: 'elevation-laterale-poulie', name: 'Élévation latérale poulie', kind: 'charge', groups: ['epaules'], perSide: true },
  { slug: 'barre-au-front', name: 'Barre au front', kind: 'charge', groups: ['triceps'] },
  { slug: 'halteres-au-front', name: 'Haltères au front', kind: 'charge', groups: ['triceps'] },
  { slug: 'extension-triceps-poulie', name: 'Extension triceps poulie', kind: 'charge', groups: ['triceps'] },
  { slug: 'curl-halteres', name: 'Curl haltères', kind: 'charge', groups: ['biceps'] },
  { slug: 'curl-banc-incline', name: 'Curl biceps banc incliné', kind: 'charge', groups: ['biceps'] },
  { slug: 'curl-marteau', name: 'Curl marteau', kind: 'charge', groups: ['biceps'] },
  { slug: 'curl-barre', name: 'Curl barre', kind: 'charge', groups: ['biceps'] },
  { slug: 'oiseau', name: 'Oiseau (élévations postérieures)', kind: 'charge', groups: ['epaules'] },
  { slug: 'extension-triceps-haltere', name: 'Extension triceps haltère au-dessus de la tête', kind: 'charge', groups: ['triceps'] },
  // Jambes
  { slug: 'sdt-roumain', name: 'SDT roumain', kind: 'charge', groups: ['jambes', 'dos'] },
  { slug: 'fentes-marchees', name: 'Fentes marchées', kind: 'charge', groups: ['jambes'] },
  { slug: 'presse-cuisses', name: 'Presse à cuisses', kind: 'charge', groups: ['jambes'] },
  { slug: 'leg-extension', name: 'Leg extension', kind: 'charge', groups: ['jambes'] },
  { slug: 'hip-thrust', name: 'Hip thrust', kind: 'charge', groups: ['jambes'] },
  { slug: 'squat', name: 'Squat', kind: 'charge', groups: ['jambes'] },
  { slug: 'fentes-bulgares', name: 'Fentes bulgares', kind: 'charge', groups: ['jambes'], perSide: true },
  { slug: 'leg-curl', name: 'Leg curl', kind: 'charge', groups: ['jambes'] },
  { slug: 'mollets', name: 'Mollets debout', kind: 'charge', groups: ['jambes'] },
  { slug: 'sled-push', name: 'Sled push', kind: 'distance', groups: ['jambes', 'cardio'] },
  // Abdos et gainage
  { slug: 'gainage', name: 'Gainage', kind: 'temps', groups: ['abdos'] },
  { slug: 'gainage-lateral', name: 'Gainage latéral', kind: 'temps', groups: ['abdos'], perSide: true },
  { slug: 'hollow-hold', name: 'Hollow hold', kind: 'temps', groups: ['abdos'] },
  { slug: 'crunch', name: 'Crunch', kind: 'temps', groups: ['abdos'] },
  { slug: 'ankle-touch', name: 'Ankle touch', kind: 'temps', groups: ['abdos'] },
  { slug: 'releve-jambes-chaise-romaine', name: 'Relevé de jambes chaise romaine', kind: 'temps', groups: ['abdos'] },
  // Conditionnement
  { slug: 'battle-rope', name: 'Battle rope', kind: 'temps', groups: ['cardio'] },
  { slug: 'burpees', name: 'Burpees', kind: 'pdc', groups: ['cardio'] },
  { slug: 'jumping-jack', name: 'Jumping jack', kind: 'temps', groups: ['cardio'] },
  // Cardio
  { slug: 'course', name: 'Course à pied', kind: 'cardio', groups: ['cardio'] },
  { slug: 'marche', name: 'Marche rapide', kind: 'cardio', groups: ['cardio'] },
  { slug: 'velo', name: 'Vélo', kind: 'cardio', groups: ['cardio'] },
  { slug: 'rameur', name: 'Rameur', kind: 'cardio', groups: ['cardio'] },
  { slug: 'elliptique', name: 'Elliptique', kind: 'cardio', groups: ['cardio'] },
  { slug: 'natation', name: 'Natation', kind: 'cardio', groups: ['cardio'] },
];

export const exId = (slug: string) => `ex:${slug}`;

export function seedExercises(): Exercise[] {
  return EX.map(({ slug, ...e }) => ({ ...e, id: exId(slug), source: 'seed' as const }));
}

/** Exercices de cardio proposés pour une séance de cardio seule. */
export const CARDIO_IDS = ['course', 'marche', 'velo', 'rameur', 'elliptique', 'natation'].map(exId);

const s = (slug: string, sets: number, target: string, restSec: number, superset?: number): ProgramBlock => ({
  kind: 'serie', exerciseId: exId(slug), sets, target, restSec, ...(superset ? { superset } : {}),
});
const c = (rounds: number, items: [string, string][], extra: { workSec?: number; restSec?: number } = {}): ProgramBlock => ({
  kind: 'circuit',
  rounds,
  items: items.map(([slug, target]) => ({ exerciseId: exId(slug), target })),
  ...extra,
});

export const PROG = { dos: 'prog:dos', pecs: 'prog:pecs', jambes: 'prog:jambes', bras: 'prog:bras' } as const;

type SeedProgram = Omit<Program, 'createdAt' | 'source'>;

/** Habitudes d'Hugo, transmises telles quelles au coach IA. */
export const TRAINING_HABITS = `Pas de jours fixes : l'ordre dépend de la semaine. Quatre séances par semaine (Dos, Pecs, Jambes, Bras / Épaules), parfois une cinquième qui refait la première de la semaine, pour laisser assez de récupération.
Exemple : lundi Pecs, mardi Jambes, mercredi Dos, jeudi ou vendredi Bras / Épaules, samedi Pecs. L'inverse existe aussi (Dos le lundi et le samedi).
Règles : jamais Dos et Pecs deux jours de suite ; Bras / Épaules toujours après une séance Dos ou Pecs, jamais avant.`;

/**
 * Règles d'enchaînement données par Hugo : jamais Dos et Pecs deux jours de suite ;
 * Bras / Épaules seulement si la séance précédente est Dos ou Pecs.
 */
export const SEED_PROGRAMS: SeedProgram[] = [
  {
    id: PROG.dos,
    name: 'Dos',
    order: 1,
    notDayAfter: [PROG.pecs],
    blocks: [
      s('tractions', 4, '8', 120),
      s('rowing-bucheron', 4, '10 D/G', 90),
      s('tirage-horizontal', 4, '12', 90),
      s('pull-over-poulie', 4, '12', 90),
      // Superset de fin : curl marteau puis curl incliné sans pause, repos après le second.
      s('curl-marteau', 4, '12', 0, 1),
      s('curl-banc-incline', 4, '12', 90, 1),
      c(4, [['battle-rope', '20 s'], ['burpees', '10 reps'], ['gainage', '30 s'], ['ankle-touch', '30 s']]),
    ],
  },
  {
    id: PROG.pecs,
    name: 'Pecs',
    order: 2,
    notDayAfter: [PROG.dos],
    blocks: [
      s('developpe-couche-halteres', 4, '6', 150),
      s('developpe-incline-smith', 4, '8', 105),
      s('dips', 4, 'échec', 120),
      s('ecarte-poulie-basse', 4, '12', 90),
      s('pull-over-haltere', 4, '12', 90),
      c(4, [['elevations-laterales', '40 s'], ['hollow-hold', '40 s'], ['crunch', '40 s'], ['gainage', '40 s']], { workSec: 40, restSec: 20 }),
    ],
  },
  {
    id: PROG.jambes,
    name: 'Jambes',
    order: 3,
    blocks: [
      s('sdt-roumain', 4, '8', 120),
      s('fentes-marchees', 4, '1 AR', 105),
      s('hip-thrust', 4, '10', 90),
      s('leg-extension', 4, '12', 90),
      c(4, [['sled-push', '1 AR'], ['jumping-jack', '20 s'], ['gainage-lateral', '30 s par côté']], { restSec: 30 }),
    ],
  },
  {
    id: PROG.bras,
    name: 'Bras / Épaules',
    order: 4,
    onlyAfter: [PROG.dos, PROG.pecs],
    blocks: [
      s('tractions-supination', 4, '8', 90),
      s('developpe-militaire-assis', 4, '8', 120),
      s('elevation-laterale-poulie', 4, '12 D/G', 60),
      s('halteres-au-front', 4, '12', 90),
      // Superset triceps-biceps de fin : extension puis curl sans pause, repos après le curl.
      s('extension-triceps-poulie', 4, '12', 0, 1),
      s('curl-halteres', 4, '10-12', 90, 1),
      c(5, [['releve-jambes-chaise-romaine', '30 s'], ['gainage', '30 s'], ['ankle-touch', '30 s']], { restSec: 30 }),
    ],
  },
];
