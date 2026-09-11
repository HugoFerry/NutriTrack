import { describe, expect, it } from 'vitest';
import { decide, shouldSync } from '../sync';

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
