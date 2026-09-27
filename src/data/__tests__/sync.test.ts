import { describe, expect, it } from 'vitest';
import { applyMods, decide, shouldSync, toRemote, unflatten } from '../sync';

describe('sync.toRemote', () => {
  it('retire les champs undefined, y compris imbriqués, sans toucher au reste', () => {
    const row = { id: 'a', brand: undefined, pcs: undefined, cal: 199, toReview: false, profile: { weight: 90, goal: undefined }, quickQty: [1, 2] };
    expect(toRemote(row)).toEqual({ id: 'a', cal: 199, toReview: false, profile: { weight: 90 }, quickQty: [1, 2] });
    expect(Object.keys(toRemote(row))).not.toContain('brand');
  });
});

describe('sync.decide', () => {
  it('pousse une ligne locale absente du serveur', () => {
    expect(decide({ updatedAt: 5 }, undefined)).toBe('push');
  });
  it('tire une ligne distante absente localement, sauf pierre tombale', () => {
    expect(decide(undefined, { updatedAt: 5 })).toBe('pull');
    expect(decide(undefined, { updatedAt: 5, deleted: true })).toBe('none');
  });
  it('la version la plus récente gagne', () => {
    expect(decide({ updatedAt: 5 }, { updatedAt: 9 })).toBe('pull');
    expect(decide({ updatedAt: 9 }, { updatedAt: 5 })).toBe('push');
    expect(decide({ updatedAt: 5 }, { updatedAt: 5 })).toBe('none');
  });
  it('une suppression distante plus récente supprime en local, sinon la ligne locale est repoussée', () => {
    expect(decide({ updatedAt: 5 }, { updatedAt: 9, deleted: true })).toBe('delete-local');
    expect(decide({ updatedAt: 9 }, { updatedAt: 5, deleted: true })).toBe('push');
  });
  it('une ligne locale sans horodatage cède face au serveur', () => {
    expect(decide({}, { updatedAt: 1 })).toBe('pull');
  });
});

describe('sync.shouldSync', () => {
  it('ignore les aliments de base non favoris', () => {
    expect(shouldSync('foods', { source: 'seed', favorite: false })).toBe(false);
    expect(shouldSync('foods', { source: 'seed', favorite: true })).toBe(true);
    expect(shouldSync('foods', { source: 'custom', favorite: false })).toBe(true);
    expect(shouldSync('entries', {})).toBe(true);
  });
});

describe('modifications imbriquées (réglages)', () => {
  const avant = { id: 'app', profile: { weight: 89.2, trainingDays: [2, 5, 6, 3], age: 24 }, waterGoalMl: 2500, updatedAt: 1 };

  it('applyMods range les chemins de Dexie dans les objets, et un chemin undefined retire le champ', () => {
    const apres = applyMods(avant, { 'profile.weight': 89.7, 'profile.trainingDays': [2, 5, 6, 3, 0], 'profile.age': undefined, waterGoalMl: 3000 });
    expect(apres).toEqual({ id: 'app', profile: { weight: 89.7, trainingDays: [2, 5, 6, 3, 0] }, waterGoalMl: 3000, updatedAt: 1 });
    expect(avant.profile.weight).toBe(89.2); // l'original n'est pas modifié
  });

  it('unflatten répare la copie serveur abîmée par l\'ancien hook (état trouvé le 27/09)', () => {
    const abimee = { ...avant, 'profile.trainingDays': [2, 5, 6, 3, 0], 'profile.weight': 89.7 };
    expect(unflatten(abimee)).toEqual({ id: 'app', profile: { weight: 89.7, trainingDays: [2, 5, 6, 3, 0], age: 24 }, waterGoalMl: 2500, updatedAt: 1 });
    expect(unflatten(avant)).toBe(avant); // ligne saine : rendue telle quelle
  });
});
