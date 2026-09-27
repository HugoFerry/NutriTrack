// Hook Stop : en fin de tour, si le code a changé depuis la dernière vérification réussie, lance le typecheck
// puis les tests et renvoie les échecs à Claude (code de sortie 2) pour qu'il corrige avant de conclure.
// Silencieux quand tout va bien ; jamais de boucle (stop_hook_active) ; rien à refaire si le code n'a pas bougé.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
if (JSON.parse(input || '{}').stop_hook_active) process.exit(0);

const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (cmd) => execSync(cmd, { cwd: dir, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });

// Ce qui peut changer le résultat du typecheck ou des tests.
const CODE = 'src package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts vitest.config.ts';

// Empreinte : dernier commit, écarts avec lui, contenu des fichiers non suivis.
let empreinte = null;
try {
  const h = createHash('sha1');
  h.update(run('git rev-parse HEAD'));
  h.update(run(`git diff HEAD -- ${CODE}`));
  for (const f of run(`git ls-files --others --exclude-standard -- ${CODE}`).split('\n').filter(Boolean)) {
    h.update(f).update(readFileSync(join(dir, f)));
  }
  empreinte = h.digest('hex');
} catch {
  // Pas de git utilisable : on vérifie à chaque fois.
}
const memo = join(tmpdir(), `nutritrack-verif-${createHash('sha1').update(dir).digest('hex').slice(0, 8)}.txt`);
if (empreinte && existsSync(memo) && readFileSync(memo, 'utf8') === empreinte) process.exit(0);

for (const [nom, cmd] of [['Typecheck', 'npm run typecheck'], ['Tests', 'npm test']]) {
  try {
    run(cmd);
  } catch (e) {
    const sortie = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
    process.stderr.write(`${nom} en échec après les modifications : corrige avant de conclure, ou dis clairement ce qui reste rouge.\n${sortie}\n`);
    process.exit(2);
  }
}
if (empreinte) writeFileSync(memo, empreinte);
