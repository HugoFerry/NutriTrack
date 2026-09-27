/** JSON à clés triées : compare deux contenus quel que soit l'ordre des champs (copie venue du serveur, objets reconstruits). */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
}
