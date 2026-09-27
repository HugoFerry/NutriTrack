// Carte `files` d'une publication de l'artefact : chaque fichier de dist-artifact/files.json, plus null pour chaque
// ancien fichier assets/… encore en ligne qui n'en fait plus partie (sinon il resterait publié, orphelin).
// Usage, depuis la racine du dépôt : node .claude/skills/publier-artefact/scripts/carte-fichiers.mjs <chemins publiés…>
import { readFileSync } from 'node:fs';

const nouveaux = JSON.parse(readFileSync('dist-artifact/files.json', 'utf8'));
const carte = { ...nouveaux };
const retires = process.argv.slice(2).filter((p) => p.startsWith('assets/') && !(p in nouveaux));
for (const p of retires) carte[p] = null;

console.log(JSON.stringify(carte));
console.error(`${Object.keys(nouveaux).length} fichier(s) à publier, ${retires.length} ancien(s) à retirer.`);
