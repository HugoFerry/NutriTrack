import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { artifactDownloads, isArtifactBuild } from './artifact';

export const isNative = () => Capacitor.isNativePlatform();

/** Partage / télécharge un fichier texte (sauvegarde JSON). */
export async function shareTextFile(name: string, content: string, mime = 'application/json'): Promise<'shared' | 'downloaded' | 'copied'> {
  if (isArtifactBuild()) {
    const dl = await artifactDownloads();
    if (dl) {
      await dl.save({ filename: name, data: content });
      return 'downloaded';
    }
    await navigator.clipboard.writeText(content);
    return 'copied';
  }
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: res.uri, dialogTitle: 'Enregistrer la sauvegarde' });
    return 'shared';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

/** Ouvre un sélecteur de fichier et renvoie le premier fichier choisi. */
export function pickFile(accept: string, capture?: 'environment' | 'user'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    // Annulation : pas d'événement fiable, on nettoie au prochain focus.
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) { resolve(null); input.remove(); } }, 800), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
