// Prépare le lot d'écritures d'une révision d'aliments NutriTrack, avec les fonctions de calcul de l'app.
//
// Usage : node preparer-lot.mjs <decisions.json> <dossier-sortie>
//
// decisions.json :
// { "aliments": [ {
//     "actuel": { ...document de l'aliment tel que lu, avec "id" },
//     "version": 1,                        // version lue, pour if_version
//     "nouveau": { "cal": 173, "p": 14, "g": 2.5, "l": 12, "fib": 1.9, "pcs": 30, "pcsLabel": "boulette", "barcode": "…" },
//     "source": "Open Food Facts 3270160149971 (fiche Picard)",
//     "entrees": [ { "id": "…", "version": 2, "qty": 12, "cal": 478 } ]   // entrées qui citent l'aliment
// } ] }
//
// Écrit dans <dossier-sortie> un fichier JSON par document, lot-1.json (lot-2.json…) à passer tel quel
// à ArtifactData `batch`, et resume.md (lignes du tableau du compte rendu).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '../../../..');
const { calcMacros, qtyLabel } = await import(pathToFileURL(path.join(racine, 'src/domain/foods.ts')).href);

const [decisionsPath, sortie] = process.argv.slice(2);
if (!decisionsPath || !sortie) {
  console.error('Usage : node preparer-lot.mjs <decisions.json> <dossier-sortie>');
  process.exit(1);
}
const { aliments = [] } = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
fs.mkdirSync(sortie, { recursive: true });

const maintenant = Date.now();
const jour = new Date(maintenant).toLocaleDateString('fr-FR');
const CHAMPS = ['name', 'brand', 'barcode', 'cal', 'p', 'g', 'l', 'fib', 'pcs', 'pcsLabel'];
const r1 = (n) => Math.round(n * 10) / 10;
const slash = (p) => p.split(path.sep).join('/');
const erreurs = [];
const alertes = [];
const writes = [];
const lignes = [];
let ecartTotal = 0;

/** Quantité d'une entrée exprimée dans l'unité du nouvel aliment (pièces ou grammes). */
function convertir(qty, avant, apres) {
  const grammes = avant.unit === 'pcs' ? qty * avant.pcs : qty;
  if (apres.unit !== 'pcs') return r1(grammes);
  // Un aliment déjà compté garde son nombre de pièces : c'est ce que l'utilisateur a déclaré.
  return avant.unit === 'pcs' ? qty : r1(grammes / apres.pcs);
}

for (const a of aliments) {
  const { actuel, version, nouveau = {}, source, entrees = [] } = a;
  const nom = actuel?.name ?? '(sans nom)';
  if (!actuel?.id || !version) { erreurs.push(`${nom} : id ou version manquant`); continue; }
  if (actuel.source === 'seed') { erreurs.push(`${nom} : aliment de base, jamais modifié par la révision`); continue; }
  if (!source) { erreurs.push(`${nom} : source manquante`); continue; }
  const inconnus = Object.keys(nouveau).filter((k) => !CHAMPS.includes(k));
  if (inconnus.length) { erreurs.push(`${nom} : champs non autorisés (${inconnus.join(', ')})`); continue; }

  const food = { ...actuel, ...nouveau };
  if (food.pcs) food.unit = 'pcs';
  else if (food.unit === 'pcs') food.unit = 'g';
  const valeurs = [food.cal, food.p, food.g, food.l, food.fib ?? 0];
  if (!valeurs.every((x) => Number.isFinite(x) && x >= 0) || food.cal > 950 || food.p + food.g + food.l > 105) {
    erreurs.push(`${nom} : valeurs pour 100 g invalides`);
    continue;
  }
  if (food.unit === 'pcs' && !(food.pcs >= 0.5 && food.pcs <= 2000)) { erreurs.push(`${nom} : poids de pièce invalide (${food.pcs})`); continue; }
  const atwater = 4 * food.p + 4 * food.g + 9 * food.l;
  if (food.cal >= 20 && Math.abs(atwater - food.cal) / food.cal > 0.15) {
    alertes.push(`${nom} : ${food.cal} kcal alors que 4·P + 4·G + 9·L = ${Math.round(atwater)} (écart > 15 %) : relire la source`);
  }

  const verif = `Vérifié le ${jour} : ${source}`;
  const note = actuel.note && !actuel.note.startsWith('Vérifié le') ? `${actuel.note} · ${verif}` : verif;
  const doc = Object.fromEntries(Object.entries(nouveau).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  Object.assign(doc, { unit: food.unit, toReview: false, note, updatedAt: maintenant });
  // Aliment qui cesse d'être compté (« pcs »: null) : une fusion garderait l'ancien poids de pièce.
  if (nouveau.pcs === null) Object.assign(doc, { pcs: { __delete__: true }, pcsLabel: { __delete__: true } });
  const fichier = path.join(sortie, `aliment-${actuel.id}.json`);
  fs.writeFileSync(fichier, JSON.stringify(doc));
  writes.push({ op: 'update', collection: 'foods', doc_id: actuel.id, file_path: slash(fichier), if_version: version });

  const recalculs = [];
  // Valeurs, poids de pièce et nom inchangés : les entrées du journal restent justes, on ne les réécrit pas.
  const changeEntrees = ['name', 'cal', 'p', 'g', 'l', 'fib', 'pcs', 'pcsLabel'].some((k) => k in nouveau && nouveau[k] !== actuel[k]);
  for (const e of changeEntrees ? entrees : []) {
    if (!e.id || !e.version || !(e.qty > 0)) { erreurs.push(`${nom} : entrée incomplète ${JSON.stringify(e)}`); continue; }
    const qty = convertir(e.qty, actuel, food);
    const m = calcMacros(food, qty);
    const f = path.join(sortie, `entree-${e.id}.json`);
    fs.writeFileSync(f, JSON.stringify({ name: food.name, qty, qtyLabel: qtyLabel(food, qty), ...m, updatedAt: maintenant }));
    writes.push({ op: 'update', collection: 'entries', doc_id: e.id, file_path: slash(f), if_version: e.version });
    recalculs.push(`${e.cal ?? '?'} → ${m.cal} kcal`);
    if (Number.isFinite(e.cal)) ecartTotal += m.cal - e.cal;
  }
  const marque = food.brand ? ` (${food.brand})` : '';
  const valeursTxt = changeEntrees ? `${actuel.cal} → ${food.cal} kcal · P ${actuel.p}→${food.p} · G ${actuel.g}→${food.g} · L ${actuel.l}→${food.l}` : `${food.cal} kcal · P ${food.p} · G ${food.g} · L ${food.l} (confirmées)`;
  lignes.push(`| ${food.name}${marque} | ${valeursTxt} | ${source} | ${recalculs.join(', ') || (changeEntrees ? 'aucune' : 'inchangées')} |`);
}

for (const x of alertes) console.log(`ALERTE ${x}`);
if (erreurs.length) {
  // Aucun lot tant qu'il reste une erreur : rien ne doit pouvoir partir à moitié.
  for (const x of erreurs) console.log(`ERREUR ${x}`);
  process.exit(1);
}

// Un batch accepte 50 écritures au plus.
const lots = [];
for (let i = 0; i < writes.length; i += 50) lots.push(writes.slice(i, i + 50));
lots.forEach((lot, i) => fs.writeFileSync(path.join(sortie, `lot-${i + 1}.json`), JSON.stringify(lot, null, 1)));
const ecart = `Écart total sur le journal : ${ecartTotal >= 0 ? '+' : ''}${ecartTotal} kcal.`;
fs.writeFileSync(path.join(sortie, 'resume.md'), ['| Aliment | Valeurs pour 100 g | Source | Entrées recalculées |', '|---|---|---|---|', ...lignes, '', ecart].join('\n') + '\n');
console.log(`${writes.length} écriture(s) en ${lots.length} lot(s) dans ${slash(sortie)}. ${ecart}`);
