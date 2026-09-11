// Transforme dist-artifact/index.html (document complet) en fragment publiable en artefact Claude :
// la plateforme fournit elle-même doctype, <html>, <head> et <body>.
import fs from 'node:fs';

const dir = 'dist-artifact';
const html = fs.readFileSync(`${dir}/index.html`, 'utf8');
const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m) => m[0].replace(/href="\.\//, 'href="'));
const scripts = [...html.matchAll(/<script[^>]+type="module"[^>]*><\/script>/g)].map((m) => m[0].replace(/src="\.\//, 'src="').replace(' crossorigin', ''));
const page = [
  '<title>NutriTrack</title>',
  '<meta name="theme-color" content="#141820">',
  ...links,
  '<div id="root"></div>',
  ...scripts,
].join('\n');
fs.writeFileSync(`${dir}/nutritrack.html`, page + '\n');
const assets = fs.readdirSync(`${dir}/assets`).map((f) => `assets/${f}`);
fs.writeFileSync(`${dir}/files.json`, JSON.stringify(Object.fromEntries(assets.map((a) => [a, a])), null, 2));
console.log('page:', `${dir}/nutritrack.html`, 'assets:', assets.length);
